import { RLP } from '@ethereumjs/rlp'
import {
  bytesToHex,
  bytesToInt,
  concatBytes,
  equalsBytes,
  intToBytes,
  utf8ToBytes,
} from '@ethereumjs/util'
import { debug as createDebugLogger } from 'debug'
import { bytesToUtf8, hexToBytes } from 'ethereum-cryptography/utils'
import { EventEmitter } from 'events'
import * as snappy from 'snappyjs'

import { devp2pDebug, formatLogData } from '../util'

import { ECIES } from './ecies'

import type { ETH, LES } from '..'
import type { Common } from '@ethereumjs/common'
import type { Debugger } from 'debug'
import type { Socket } from 'net'
import { Protocol } from '../protocol/protocol'

const DEBUG_BASE_NAME = 'rlpx:peer'
const verbose = createDebugLogger('verbose').enabled

export const BASE_PROTOCOL_VERSION = 5
export const BASE_PROTOCOL_LENGTH = 16

export const PING_INTERVAL = 15000 // 15 sec * 1000

export enum PREFIXES {
  HELLO = 0x00,
  DISCONNECT = 0x01,
  PING = 0x02,
  PONG = 0x03,
}

export enum DISCONNECT_REASONS {
  DISCONNECT_REQUESTED = 0x00,
  NETWORK_ERROR = 0x01,
  PROTOCOL_ERROR = 0x02,
  USELESS_PEER = 0x03,
  TOO_MANY_PEERS = 0x04,
  ALREADY_CONNECTED = 0x05,
  INCOMPATIBLE_VERSION = 0x06,
  INVALID_IDENTITY = 0x07,
  CLIENT_QUITTING = 0x08,
  UNEXPECTED_IDENTITY = 0x09,
  SAME_IDENTITY = 0x0a,
  TIMEOUT = 0x0b,
  SUBPROTOCOL_ERROR = 0x10,
}

export type HelloMsg = {
  0: Uint8Array
  1: Uint8Array
  2: Uint8Array[][]
  3: Uint8Array
  4: Uint8Array
  length: 5
}

export interface ProtocolConstructor {
  new (...args: any[]): any
}

export interface Capabilities {
  name: string
  version: number
  length: number
  constructor: ProtocolConstructor
}

export interface Hello {
  protocolVersion: number
  clientId: string
  capabilities: Capabilities[]
  port: number
  id: Uint8Array
}

export class Peer extends EventEmitter {
  _clientId: Uint8Array
  _capabilities?: Capabilities[]
  _common: Common
  _port: number
  _id: Uint8Array
  _remoteClientIdFilter: any
  _remoteId: Uint8Array
  _EIP8: Uint8Array | boolean
  _eciesSession: ECIES
  _state: string
  _weHello: HelloMsg | null
  _hello: Hello | null
  _nextPacketSize: number
  _socket: Socket
  _socketData: Uint8Array
  _pingIntervalId: NodeJS.Timeout | null
  _pingTimeoutId: NodeJS.Timeout | null
  _closed: boolean
  _connected: boolean
  _disconnectReason?: DISCONNECT_REASONS
  _disconnectWe: null | boolean
  _pingTimeout: number
  _logger: Debugger

  /**
   * Subprotocols (e.g. `ETH`) derived from the exchange on
   * capabilities
   */
  _protocols: (ETH | LES)[]

  constructor(options: any) {
    super()

    // hello data
    this._clientId = options.clientId
    this._capabilities = options.capabilities
    this._common = options.common
    this._port = options.port
    this._id = options.id
    this._remoteClientIdFilter = options.remoteClientIdFilter

    // ECIES session
    this._remoteId = options.remoteId
    this._EIP8 = options.EIP8 !== undefined ? options.EIP8 : true
    this._eciesSession = new ECIES(options.privateKey, this._id, this._remoteId)

    // Auth, Ack, Header, Body
    this._state = 'Auth'
    this._weHello = null
    this._hello = null
    this._nextPacketSize = 307

    // socket
    this._socket = options.socket
    this._socketData = new Uint8Array()
    this._socket.on('data', this._onSocketData.bind(this))
    this._socket.on('error', (err: Error) => this.emit('error', err))
    this._socket.once('close', this._onSocketClose.bind(this))
    this._logger =
      this._socket.remoteAddress !== undefined
        ? devp2pDebug.extend(this._socket.remoteAddress).extend(DEBUG_BASE_NAME)
        : devp2pDebug.extend(DEBUG_BASE_NAME)
    this._connected = false
    this._closed = false
    this._disconnectWe = null
    this._pingIntervalId = null
    this._pingTimeout = options.timeout
    this._pingTimeoutId = null

    // sub-protocols
    this._protocols = []

    // send AUTH if outgoing connection
    if (this._remoteId !== null) {
      this._sendAuth()
    }
  }

  /**
   * Send AUTH message
   */
  _sendAuth() {
    if (this._closed) return
    this._logger(
      `Send auth (EIP8: ${this._EIP8}) to ${this._socket.remoteAddress}:${this._socket.remotePort}`
    )
    if (this._EIP8 === true) {
      const authEIP8 = this._eciesSession.createAuthEIP8()
      if (!authEIP8) return
      this._socket.write(authEIP8)
    } else {
      const authNonEIP8 = this._eciesSession.createAuthNonEIP8()
      if (!authNonEIP8) return
      this._socket.write(authNonEIP8)
    }
    this._state = 'Ack'
    this._nextPacketSize = 210
  }

  /**
   * Send ACK message
   */
  _sendAck() {
    if (this._closed) return
    this._logger(
      `Send ack (EIP8: ${this._eciesSession._gotEIP8Auth}) to ${this._socket.remoteAddress}:${this._socket.remotePort}`
    )
    if (this._eciesSession._gotEIP8Auth) {
      const ackEIP8 = this._eciesSession.createAckEIP8()
      if (!ackEIP8) return
      this._socket.write(ackEIP8)
    } else {
      const ackOld = this._eciesSession.createAckOld()
      if (!ackOld) return
      this._socket.write(ackOld)
    }
    this._state = 'Header'
    this._nextPacketSize = 32
    this._sendHello()
  }

  /**
   * Create message HEADER and BODY and send to socket
   * Also called from SubProtocol context
   * @param code
   * @param data
   */
  _sendMessage(code: number, data: Uint8Array) {
    if (this._closed) return false

    const msg = concatBytes(RLP.encode(code), data)
    const header = this._eciesSession.createHeader(msg.length)
    if (!header || this._socket.destroyed) return
    this._socket.write(header)

    const body = this._eciesSession.createBody(msg)
    // this._socket.destroyed added here and above to safeguard against
    // occasional "Cannot call write after a stream was destroyed" errors.
    // Eventually this can be caught earlier down the line.
    if (!body || this._socket.destroyed) return
    this._socket.write(body)
    return true
  }

  /**
   * Send HELLO message
   */
  _sendHello() {
    const debugMsg = `Send HELLO to ${this._socket.remoteAddress}:${
      this._socket.remotePort
    }  protocolVersion=${BASE_PROTOCOL_VERSION} capabilities=${(this._capabilities ?? [])
      // Filter out snap because we can't yet provide snap endpoints to the peers
      // TODO: Remove when we can also serve snap requests from other peers
      .filter((c) => c.name !== 'snap')
      .map((c) => `${c.name}${c.version}`)
      .join(',')} clientId=${bytesToUtf8(this._clientId)}`
    this.debug('HELLO', debugMsg)
    const payload: HelloMsg = [
      intToBytes(BASE_PROTOCOL_VERSION),
      this._clientId,
      this._capabilities!.map((c) => [utf8ToBytes(c.name), intToBytes(c.version)]),
      this._port === null ? new Uint8Array(0) : intToBytes(this._port),
      this._id,
    ]

    if (!this._closed) {
      if (
        this._sendMessage(PREFIXES.HELLO, RLP.encode(payload as never as Uint8Array[])) === true
      ) {
        this._weHello = payload
      }
      if (this._hello) {
        this.emit('connect')
      }
    }
  }

  /**
   * Send DISCONNECT message
   * @param reason
   */
  _sendDisconnect(reason: DISCONNECT_REASONS) {
    const reasonName = this.getDisconnectPrefix(reason)
    const debugMsg = `Send DISCONNECT to ${this._socket.remoteAddress}:${this._socket.remotePort} (reason: ${reasonName})`
    this.debug('DISCONNECT', debugMsg, reasonName)
    const data = RLP.encode(reason)
    if (this._sendMessage(PREFIXES.DISCONNECT, data) !== true) return

    this._disconnectReason = reason
    this._disconnectWe = true
    this._closed = true
    setTimeout(() => this._socket.end(), 2000) // 2 sec * 1000
  }

  /**
   * Send PING message
   */
  _sendPing() {
    const debugMsg = `Send PING to ${this._socket.remoteAddress}:${this._socket.remotePort}`
    this.debug('PING', debugMsg)
    let data = RLP.encode([])
    if (this._hello !== null && this._hello.protocolVersion >= 5) {
      data = snappy.compress(data)
    }

    if (this._sendMessage(PREFIXES.PING, data) !== true) return

    clearTimeout(this._pingTimeoutId!)
    this._pingTimeoutId = setTimeout(() => {
      this.disconnect(DISCONNECT_REASONS.TIMEOUT)
    }, this._pingTimeout)
  }

  /**
   * Send PONG message
   */
  _sendPong() {
    const debugMsg = `Send PONG to ${this._socket.remoteAddress}:${this._socket.remotePort}`
    this.debug('PONG', debugMsg)
    let data = RLP.encode([])

    if (this._hello !== null && this._hello.protocolVersion >= 5) {
      data = snappy.compress(data)
    }
    this._sendMessage(PREFIXES.PONG, data)
  }

  /**
   * AUTH message received
   */
  _handleAuth() {
    const bytesCount = this._nextPacketSize
    const parseData = this._socketData.subarray(0, bytesCount)
    if (!this._eciesSession._gotEIP8Auth) {
      if (parseData.subarray(0, 1) === hexToBytes('04')) {
        this._eciesSession.parseAuthPlain(parseData)
      } else {
        this._eciesSession._gotEIP8Auth = true
        this._nextPacketSize = bytesToInt(this._socketData.subarray(0, 2)) + 2
        return
      }
    } else {
      this._eciesSession.parseAuthEIP8(parseData)
    }
    this._state = 'Header'
    this._nextPacketSize = 32
    process.nextTick(() => this._sendAck())
    this._socketData = this._socketData.subarray(bytesCount)
  }

  /**
   * ACK message received
   */
  _handleAck() {
    const bytesCount = this._nextPacketSize
    const parseData = this._socketData.subarray(0, bytesCount)
    if (!this._eciesSession._gotEIP8Ack) {
      if (parseData.subarray(0, 1) === hexToBytes('04')) {
        this._eciesSession.parseAckPlain(parseData)
        this._logger(
          `Received ack (old format) from ${this._socket.remoteAddress}:${this._socket.remotePort}`
        )
      } else {
        this._eciesSession._gotEIP8Ack = true
        this._nextPacketSize = bytesToInt(this._socketData.subarray(0, 2)) + 2
        return
      }
    } else {
      this._eciesSession.parseAckEIP8(parseData)
      this._logger(
        `Received ack (EIP8) from ${this._socket.remoteAddress}:${this._socket.remotePort}`
      )
    }
    this._state = 'Header'
    this._nextPacketSize = 32
    process.nextTick(() => this._sendHello())
    this._socketData = this._socketData.subarray(bytesCount)
  }

  /**
   * HELLO message received
   */
  _handleHello(payload: any) {
    this._hello = {
      protocolVersion: bytesToInt(payload[0]),
      clientId: bytesToUtf8(payload[1]),
      capabilities: payload[2].map((item: any) => {
        return { name: bytesToUtf8(item[0]), version: bytesToInt(item[1]) }
      }),
      port: bytesToInt(payload[3]),
      id: payload[4],
    }

    const debugMsg = `Received HELLO ${this._socket.remoteAddress}:${
      this._socket.remotePort
    } protocolVersion=${this._hello.protocolVersion} capabilities=${(this._hello.capabilities ?? [])
      .map((c) => `${c.name}${c.version}`)
      .join(',')} clientId=${this._hello.clientId}`
    this.debug('HELLO', debugMsg)

    if (this._remoteId === null) {
      this._remoteId = this._hello.id
    } else if (!equalsBytes(this._remoteId, this._hello.id)) {
      return this.disconnect(DISCONNECT_REASONS.INVALID_IDENTITY)
    }

    if (this._remoteClientIdFilter !== undefined) {
      for (const filterStr of this._remoteClientIdFilter) {
        if (this._hello.clientId.toLowerCase().includes(filterStr.toLowerCase())) {
          return this.disconnect(DISCONNECT_REASONS.USELESS_PEER)
        }
      }
    }

    const shared: any = {}
    for (const item of this._hello.capabilities) {
      for (const c of this._capabilities!) {
        if (c.name !== item.name || c.version !== item.version) continue
        if (shared[c.name] !== undefined && shared[c.name].version > c.version) continue
        shared[c.name] = c
      }
    }

    let protoRW = Object.keys(shared)
      .map((key) => shared[key])
      .sort((obj1, obj2) => (obj1.name < obj2.name ? -1 : 1))

    this._protocols = []
    let offset = BASE_PROTOCOL_LENGTH
    for (const proto of protoRW) {
      const SubProtocol = proto.constructor
      const protocol = new SubProtocol(proto.version, this, offset, proto.length)
      this._protocols.push(protocol)

      offset += proto.length
    }

    if (this._protocols.length === 0) {
      return this.disconnect(DISCONNECT_REASONS.USELESS_PEER)
    }

    this._connected = true
    this._pingIntervalId = setInterval(() => this._sendPing(), PING_INTERVAL)
    if (this._weHello) {
      this.emit('connect')
    }
  }

  /**
   * DISCONNECT message received
   * @param payload
   */
  _handleDisconnect(payload: any) {
    this._closed = true
    // When `payload` is from rlpx it is `Uint8Array` and when from subprotocol it is `[Uint8Array]`
    this._disconnectReason =
      payload instanceof Uint8Array
        ? bytesToInt(payload)
        : bytesToInt(payload[0] ?? Uint8Array.from([0]))
    const reason = DISCONNECT_REASONS[this._disconnectReason as number]
    const debugMsg = `DISCONNECT reason: ${reason} ${this._socket.remoteAddress}:${this._socket.remotePort}`
    this.debug('DISCONNECT', debugMsg, reason)
    this._disconnectWe = false
    this._socket.end()
  }

  /**
   * PING message received
   */
  _handlePing() {
    this._sendPong()
  }

  /**
   * PONG message received
   */
  _handlePong() {
    clearTimeout(this._pingTimeoutId!)
  }

  /**
   * Message handling, called from a SubProtocol context
   * @param code
   * @param msg
   */
  _handleMessage(code: PREFIXES, msg: Uint8Array) {
    switch (code) {
      case PREFIXES.HELLO:
        this._handleHello(msg)
        break
      case PREFIXES.DISCONNECT:
        this._handleDisconnect(msg)
        break
      case PREFIXES.PING:
        this._handlePing()
        break
      case PREFIXES.PONG:
        this._handlePong()
        break
    }
  }

  /**
   * Handle message header
   */
  _handleHeader() {
    const bytesCount = this._nextPacketSize
    const parseData = this._socketData.subarray(0, bytesCount)
    this._logger(`Received header ${this._socket.remoteAddress}:${this._socket.remotePort}`)
    const size = this._eciesSession.parseHeader(parseData)
    if (size === undefined) {
      this._logger('invalid header size!')
      return
    }

    this._state = 'Body'
    this._nextPacketSize = size + 16
    if (size % 16 > 0) this._nextPacketSize += 16 - (size % 16)
    this._socketData = this._socketData.subarray(bytesCount)
  }

  /**
   * Handle message body
   */
  _handleBody() {
    const bytesCount = this._nextPacketSize
    const parseData = this._socketData.subarray(0, bytesCount)
    const body = this._eciesSession.parseBody(parseData)
    if (!body) {
      this._logger('empty body!')
      return
    }
    this._logger(
      `Received body ${this._socket.remoteAddress}:${this._socket.remotePort} ${formatLogData(
        bytesToHex(body),
        verbose
      )}`
    )
    this._state = 'Header'
    this._nextPacketSize = 32

    // RLP hack
    let code = body[0]
    if (code === 0x80) code = 0

    if (code !== PREFIXES.HELLO && code !== PREFIXES.DISCONNECT && this._hello === null) {
      return this.disconnect(DISCONNECT_REASONS.PROTOCOL_ERROR)
    }
    // Protocol object referencing either this Peer object or the
    // underlying subprotocol (e.g. `ETH`)
    const protocolObj = this._getProtocol(code)
    if (protocolObj === undefined) return this.disconnect(DISCONNECT_REASONS.PROTOCOL_ERROR)

    if (protocolObj !== null) {
      code -= protocolObj._offset
    }

    try {
      let payload: any = body.subarray(1)

      // Use snappy uncompression if peer supports DevP2P >=v5
      let compressed = false
      const origPayload = payload
      if (this._hello !== null && this._hello.protocolVersion >= 5) {
        payload = snappy.uncompress(payload)
        compressed = true
      }
      // Hotfix, 2021-09-21
      // For a DISCONNECT message received it is often hard to
      // decide if received within or outside the scope of the
      // protocol handshake (both can happen).
      //
      // This lead to problems with unjustifiedly applying
      // the snappy compression which subsequently breaks the
      // RLP decoding.
      //
      // This is fixed by this hotfix by re-trying with the
      // respective compressed/non-compressed payload.
      //
      // Note: there might be a cleaner solution to apply here.
      //
      if (protocolObj === null) {
        try {
          payload = RLP.decode(payload)
        } catch (e: any) {
          if (code === PREFIXES.DISCONNECT) {
            if (compressed) {
              payload = RLP.decode(origPayload)
            } else {
              payload = RLP.decode(snappy.uncompress(payload))
            }
          } else {
            throw new Error(e)
          }
        }
        this._handleMessage(code, payload)
      } else {
        protocolObj._handleMessage(code, payload)
      }
    } catch (err: any) {
      this.disconnect(DISCONNECT_REASONS.SUBPROTOCOL_ERROR)
      this._logger(`Error on peer subprotocol message handling: ${err}`)
      this.emit('error', err)
    }
    this._socketData = this._socketData.subarray(bytesCount)
  }

  /**
   * Process socket data
   * @param data
   */
  _onSocketData(data: Uint8Array) {
    if (this._closed) return
    this._socketData = concatBytes(this._socketData, data)
    try {
      while (this._socketData.length >= this._nextPacketSize) {
        switch (this._state) {
          case 'Auth':
            this._handleAuth()
            break
          case 'Ack':
            this._handleAck()
            break
          case 'Header':
            this._handleHeader()
            break
          case 'Body':
            this._handleBody()
            break
        }
      }
    } catch (err: any) {
      this.disconnect(DISCONNECT_REASONS.SUBPROTOCOL_ERROR)
      this._logger(`Error on peer socket data handling: ${err}`)
      this.emit('error', err)
    }
  }

  /**
   * React to socket being closed
   */
  _onSocketClose() {
    clearInterval(this._pingIntervalId!)
    clearTimeout(this._pingTimeoutId!)

    this._closed = true
    if (this._connected) this.emit('close', this._disconnectReason, this._disconnectWe)
  }

  /**
   * Returns either a protocol object with a `protocol` parameter
   * reference to this Peer instance or to a subprotocol instance (e.g. `ETH`)
   * (depending on the `code` provided)
   */
  _getProtocol(code: number): Protocol | null | undefined {
    if (code < BASE_PROTOCOL_LENGTH) return null
    for (const obj of this._protocols) {
      if (code >= obj._offset && code < obj._offset + obj._length!) return obj
    }
    return undefined
  }

  getId() {
    if (this._remoteId === null) return null
    return this._remoteId
  }

  getHelloMessage() {
    return this._hello
  }

  getProtocols<T extends ETH | LES>(): (ETH | LES)[] {
    return this._protocols
  }

  getMsgPrefix(code: PREFIXES): string {
    return PREFIXES[code]
  }

  getDisconnectPrefix(code: DISCONNECT_REASONS): string {
    return DISCONNECT_REASONS[code]
  }

  disconnect(reason: DISCONNECT_REASONS = DISCONNECT_REASONS.DISCONNECT_REQUESTED) {
    this._sendDisconnect(reason)
  }

  /**
   * Called once from the subprotocol (e.g. `ETH`) on the peer
   * where a first successful `STATUS` msg exchange could be achieved.
   *
   * Can be used together with the `devp2p:FIRST_PEER` debugger.
   */
  _addFirstPeerDebugger() {
    const ip = this._socket.remoteAddress
    if (typeof ip === 'string') {
      this._logger = devp2pDebug.extend(ip).extend(`FIRST_PEER`).extend(DEBUG_BASE_NAME)
    }
  }

  /**
   * Debug message both on the generic as well as the
   * per-message debug logger
   * @param messageName Capitalized message name (e.g. `HELLO`)
   * @param msg Message text to debug
   * @param disconnectReason Capitalized disconnect reason (e.g. 'TIMEOUT')
   */
  private debug(messageName: string, msg: string, disconnectReason?: string) {
    if (disconnectReason !== undefined) {
      this._logger.extend(messageName).extend(disconnectReason)(msg)
    } else {
      this._logger.extend(messageName)(msg)
    }
  }
}
