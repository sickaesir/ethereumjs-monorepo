import { RLP, utils } from '@ethereumjs/rlp'
import { intToBytes } from '@ethereumjs/util'
import { bytesToHex } from 'ethereum-cryptography/utils'
import * as snappy from 'snappyjs'

import { formatLogData } from '../util'

import { EthProtocol, Protocol } from './protocol'

import type { Peer } from '../rlpx/peer'

export class BSC extends Protocol {
  constructor(version: number, peer: Peer, offset: number, length: number) {
    super(peer, offset, length, EthProtocol.BSC, version, BSC.MESSAGE_CODES)
  }

  static bsc = { name: 'bsc', version: 1, length: 2, constructor: BSC }

  _handleMessage(code: BSC.MESSAGE_CODES, data: any) {
    const payload = RLP.decode(data) as unknown
    const messageName = this.getMsgPrefix(code)

    // Note, this needs optimization, see issue #1882
    const debugMsg = `Received ${messageName} message from ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort}`
    const logData = formatLogData(bytesToHex(data), this._verbose)
    this.debug(messageName, `${debugMsg}: ${logData}`)

    switch (code) {
      case BSC.MESSAGE_CODES.CAPABILITIES: {
        clearTimeout(this._statusTimeoutId!)
        break
      }
      case BSC.MESSAGE_CODES.VOTES:
        break
      default:
        return
    }

    this.emit('message', code, payload)
  }

  sendStatus() {
    this.sendMessage(BSC.MESSAGE_CODES.CAPABILITIES, [intToBytes(this._version), [0x00]])
  }

  /**
   *
   * @param code Message code
   * @param payload Payload (including reqId, e.g. `[1, [437000, 1, 0, 0]]`)
   */
  sendMessage(code: BSC.MESSAGE_CODES, payload: any) {
    const messageName = this.getMsgPrefix(code)
    const logData = formatLogData(utils.bytesToHex(RLP.encode(payload)), this._verbose)
    const debugMsg = `Send ${messageName} message to ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort}: ${logData}`

    this.debug(messageName, debugMsg)

    switch (code) {
      case BSC.MESSAGE_CODES.CAPABILITIES:
      case BSC.MESSAGE_CODES.VOTES:
        break
      default:
        throw new Error(`Unknown code ${code}`)
    }

    payload = RLP.encode(payload)

    // Use snappy compression if peer supports DevP2P >=v5
    const protocolVersion = this._peer._hello?.protocolVersion
    if (protocolVersion !== undefined && protocolVersion >= 5) {
      payload = snappy.compress(payload)
    }

    this._sendMessage(code, payload)
  }

  getMsgPrefix(msgCode: BSC.MESSAGE_CODES): string {
    return BSC.MESSAGE_CODES[msgCode]
  }

  getVersion() {
    return this._version
  }
}

export namespace BSC {
  export enum MESSAGE_CODES {
    // bsc1
    CAPABILITIES = 0x00,
    VOTES = 0x01,
  }
}
