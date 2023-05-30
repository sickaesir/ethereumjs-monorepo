import { RLP, utils } from '@ethereumjs/rlp'
import { intToBytes } from '@ethereumjs/util'
import { bytesToHex } from 'ethereum-cryptography/utils'
import * as snappy from 'snappyjs'

import { formatLogData } from '../util'

import { EthProtocol, Protocol } from './protocol'

import type { Peer } from '../rlpx/peer'

export class DIFF extends Protocol {
  constructor(version: number, peer: Peer, offset: number, length: number) {
    super(peer, offset, length, EthProtocol.DIFF, version, DIFF.MESSAGE_CODES)
  }

  static diff = { name: 'diff', version: 1, length: 4, constructor: DIFF }

  _handleMessage(code: DIFF.MESSAGE_CODES, data: any) {
    const payload = RLP.decode(data) as unknown
    const messageName = this.getMsgPrefix(code)

    // Note, this needs optimization, see issue #1882
    const debugMsg = `Received ${messageName} message from ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort}`
    const logData = formatLogData(bytesToHex(data), this._verbose)
    this.debug(messageName, `${debugMsg}: ${logData}`)

    switch (code) {
      case DIFF.MESSAGE_CODES.CAPABILITIES: {
        clearTimeout(this._statusTimeoutId!)
        break
      }
      case DIFF.MESSAGE_CODES.GET_DIFF:
      case DIFF.MESSAGE_CODES.DIFF_LAYER:
      case DIFF.MESSAGE_CODES.FULL_DIFF_LAYER:
        break
      default:
        return
    }

    this.emit('message', code, payload)
  }

  sendStatus(diffSync: boolean) {
    this.sendMessage(DIFF.MESSAGE_CODES.CAPABILITIES, [
      Uint8Array.from(diffSync ? [1] : []),
      [0x00],
    ])
  }

  /**
   *
   * @param code Message code
   * @param payload Payload (including reqId, e.g. `[1, [437000, 1, 0, 0]]`)
   */
  sendMessage(code: DIFF.MESSAGE_CODES, payload: any) {
    const messageName = this.getMsgPrefix(code)
    const logData = formatLogData(utils.bytesToHex(RLP.encode(payload)), this._verbose)
    const debugMsg = `Send ${messageName} message to ${this._peer._socket.remoteAddress}:${this._peer._socket.remotePort}: ${logData}`

    this.debug(messageName, debugMsg)

    switch (code) {
      case DIFF.MESSAGE_CODES.CAPABILITIES:
      case DIFF.MESSAGE_CODES.GET_DIFF:
      case DIFF.MESSAGE_CODES.DIFF_LAYER:
      case DIFF.MESSAGE_CODES.FULL_DIFF_LAYER:
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

  getMsgPrefix(msgCode: DIFF.MESSAGE_CODES): string {
    return DIFF.MESSAGE_CODES[msgCode]
  }

  getVersion() {
    return this._version
  }
}

export namespace DIFF {
  export enum MESSAGE_CODES {
    // diff1
    CAPABILITIES = 0x00,
    GET_DIFF = 0x01,
    DIFF_LAYER = 0x02,
    FULL_DIFF_LAYER = 0x03,
  }
}
