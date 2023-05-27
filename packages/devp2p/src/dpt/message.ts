import { RLP } from '@ethereumjs/rlp'
import { bigIntToBytes, bytesToBigInt, bytesToInt, intToBytes } from '@ethereumjs/util'
import { debug as createDebugLogger } from 'debug'
import { secp256k1 } from 'ethereum-cryptography/secp256k1'
import { ecdsaRecover, ecdsaSign } from 'ethereum-cryptography/secp256k1-compat'
import { bytesToHex, bytesToUtf8, concatBytes, utf8ToBytes } from 'ethereum-cryptography/utils'

import {
  assertEq,
  ipToBytes,
  ipToString,
  isV4Format,
  isV6Format,
  keccak256,
  unstrictDecode,
} from '../util'

import type { PeerInfo } from './dpt'

const debug = createDebugLogger('devp2p:dpt:server')

function getTimestamp() {
  return (Date.now() / 1000) | 0
}

const timestamp = {
  encode(value = getTimestamp() + 60) {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, value)
    return bytes
  },
  decode(bytes: Uint8Array) {
    if (bytes.length !== 4) throw new RangeError(`Invalid timestamp bytes :${bytesToHex(bytes)}`)
    return new DataView(bytes.buffer).getUint32(0)
  },
}

const address = {
  encode(value: string) {
    if (isV4Format(value)) return ipToBytes(value)
    if (isV6Format(value)) return ipToBytes(value)
    throw new Error(`Invalid address: ${value}`)
  },
  decode(bytes: Uint8Array) {
    if (bytes.length === 4) return ipToString(bytes)
    if (bytes.length === 16) return ipToString(bytes)

    const str = bytesToUtf8(bytes)
    if (isV4Format(str) || isV6Format(str)) return str

    // also can be host, but skip it right now (because need async function for resolve)
    throw new Error(`Invalid address bytes: ${bytesToHex(bytes)}`)
  },
}

const port = {
  encode(value: number | null): Uint8Array {
    if (value === null) return new Uint8Array()
    if (value >>> 16 > 0) throw new RangeError(`Invalid port: ${value}`)
    return Uint8Array.from([(value >>> 8) & 0xff, (value >>> 0) & 0xff])
  },
  decode(bytes: Uint8Array): number | null {
    if (bytes.length === 0) return null
    return bytesToInt(bytes)
  },
}

const endpoint = {
  encode(obj: PeerInfo): Uint8Array[] {
    return [
      address.encode(obj.address!),
      port.encode(obj.udpPort ?? null),
      port.encode(obj.tcpPort ?? null),
    ]
  },
  decode(payload: Uint8Array[]): PeerInfo {
    return {
      address: address.decode(payload[0]),
      udpPort: port.decode(payload[1]),
      tcpPort: port.decode(payload[2]),
    }
  },
}

type InPing = { [0]: Uint8Array; [1]: Uint8Array[]; [2]: Uint8Array[]; [3]: Uint8Array }
type OutPing = { version: number; from: PeerInfo; to: PeerInfo; timestamp: number }
const ping = {
  encode(obj: OutPing /*, privateKey: Uint8Array*/): InPing {
    return [
      intToBytes(obj.version),
      endpoint.encode(obj.from),
      endpoint.encode(obj.to),
      timestamp.encode(obj.timestamp),
    ]
  },
  decode(payload: InPing): OutPing {
    return {
      version: bytesToInt(payload[0]),
      from: endpoint.decode(payload[1]),
      to: endpoint.decode(payload[2]),
      timestamp: timestamp.decode(payload[3]),
    }
  },
}

type OutPong = { to: PeerInfo; hash: Uint8Array; timestamp: number }
type InPong = { [0]: Uint8Array[]; [1]: Uint8Array[]; [2]: Uint8Array }
const pong = {
  encode(obj: OutPong /*, privateKey: Uint8Array*/) {
    return [endpoint.encode(obj.to), obj.hash, timestamp.encode(obj.timestamp)]
  },
  decode(payload: InPong) {
    return {
      to: endpoint.decode(payload[0]),
      hash: payload[1],
      timestamp: timestamp.decode(payload[2]),
    }
  },
}

type OutFindMsg = { id: string; timestamp: number }
type InFindMsg = { [0]: string; [1]: Uint8Array }
const findneighbours = {
  encode(obj: OutFindMsg /*, privateKey: Uint8Array*/): InFindMsg {
    return [obj.id, timestamp.encode(obj.timestamp)]
  },
  decode(payload: InFindMsg): OutFindMsg {
    return {
      id: payload[0],
      timestamp: timestamp.decode(payload[1]),
    }
  },
}

type InNeighborMsg = { peers: PeerInfo[]; timestamp: number }
type OutNeighborMsg = { [0]: Uint8Array[][]; [1]: Uint8Array }
const neighbours = {
  encode(obj: InNeighborMsg /*, privateKey: Uint8Array*/): OutNeighborMsg {
    return [
      obj.peers.map((peer: PeerInfo) => endpoint.encode(peer).concat(peer.id! as Uint8Array)),
      timestamp.encode(obj.timestamp),
    ]
  },
  decode(payload: OutNeighborMsg): InNeighborMsg {
    return {
      peers: payload[0].map((data) => {
        return { endpoint: endpoint.decode(data), id: data[3] } // hack for id
      }),
      timestamp: timestamp.decode(payload[1]),
    }
  },
}

type InENRRequestMsg = { timestamp: number }
type OutENRRequestMsg = { [0]: Uint8Array }
const enrrequest = {
  encode(obj: InENRRequestMsg /*, privateKey: Uint8Array*/): OutENRRequestMsg {
    return [timestamp.encode(obj.timestamp)]
  },
  decode(payload: OutENRRequestMsg): InENRRequestMsg {
    return {
      timestamp: timestamp.decode(payload[0]),
    }
  },
}

type InENRResponseMsg = {
  hash: Uint8Array
  seq: bigint
  id?: string
  publicKey?: Uint8Array
  ip?: string
  tcp?: number
  udp?: number
  ip6?: string
  tcp6?: number
  udp6?: number
  forkId?: [Uint8Array, Uint8Array]
  snap: boolean
  bsc: boolean
  les?: number
}
type OutENRResponseMsg = { [0]: Uint8Array; [1]: Uint8Array[] }
const enrresponse = {
  encode(obj: InENRResponseMsg, privateKey: Uint8Array): OutENRResponseMsg {
    const kv: { k: string; v: any }[] = []

    if (obj.id === undefined) obj.id = 'v4'
    if (obj.publicKey === undefined) obj.publicKey = secp256k1.getPublicKey(privateKey, true)

    kv.push({ k: 'id', v: utf8ToBytes(obj.id) })
    kv.push({ k: 'secp256k1', v: obj.publicKey })
    if (obj.ip !== undefined) kv.push({ k: 'ip', v: address.encode(obj.ip) })
    if (obj.tcp !== undefined) kv.push({ k: 'tcp', v: port.encode(obj.tcp) })
    if (obj.udp !== undefined) kv.push({ k: 'udp', v: port.encode(obj.udp) })
    if (obj.ip6 !== undefined) kv.push({ k: 'ip6', v: address.encode(obj.ip6) })
    if (obj.tcp6 !== undefined) kv.push({ k: 'tcp6', v: port.encode(obj.tcp6) })
    if (obj.udp6 !== undefined) kv.push({ k: 'udp6', v: port.encode(obj.udp6) })
    if (obj.forkId) kv.push({ k: 'eth', v: [[obj.forkId[0], obj.forkId[1]]] })
    if (obj.snap) kv.push({ k: 'snap', v: [] })
    if (obj.bsc) kv.push({ k: 'bsc', v: [] })
    if (obj.les !== undefined) kv.push({ k: 'les', v: [obj.les] })

    const content = [
      bigIntToBytes(obj.seq),
      ...kv
        .sort((a, b) => a.k.localeCompare(b.k))
        .map((entry) => [utf8ToBytes(entry.k), entry.v])
        .flat(),
    ]

    const sig = secp256k1.sign(keccak256(RLP.encode(content)), privateKey)

    return [obj.hash, [concatBytes(bigIntToBytes(sig.r), bigIntToBytes(sig.s)), ...content]]
  },
  decode(payload: OutENRResponseMsg): InENRResponseMsg {
    const kvPayload = payload[1].slice(2)
    const kv: { k: string; v: any }[] = []
    for (let i = 0; i < kvPayload.length; i += 2) {
      kv.push({
        k: bytesToUtf8(kvPayload[i]),
        v: kvPayload[i + 1],
      })
    }
    //const signature = payload[1][0]

    const obj: InENRResponseMsg = {
      hash: payload[0],
      seq: bytesToBigInt(payload[1][1]),
      ip: undefined,
      tcp: undefined,
      udp: undefined,
      ip6: undefined,
      tcp6: undefined,
      udp6: undefined,
      forkId: undefined,
      bsc: false,
      snap: false,
      les: undefined,
    }

    for (const entry of kv) {
      switch (entry.k) {
        case 'secp256k1':
          obj.publicKey = entry.v
          break
        case 'id':
          obj.id = bytesToUtf8(entry.v)
          break
        case 'ip':
          obj.ip = address.decode(entry.v as Uint8Array)
          break
        case 'tcp':
          obj.tcp = port.decode(entry.v as Uint8Array) ?? undefined
          break
        case 'udp':
          obj.udp = port.decode(entry.v as Uint8Array) ?? undefined
          break
        case 'ip6':
          obj.ip6 = address.decode(entry.v as Uint8Array)
          break
        case 'tcp6':
          obj.tcp6 = port.decode(entry.v as Uint8Array) ?? undefined
          break
        case 'udp6':
          obj.udp6 = port.decode(entry.v as Uint8Array) ?? undefined
          break
        case 'eth':
          obj.forkId = [entry.v[0][0], entry.v[0][1]]
          break
        case 'bsc':
          obj.bsc = true
          break
        case 'snap':
          obj.snap = true
          break
        case 'les':
          obj.les = bytesToInt(entry.v[0])
          break
      }
    }

    return obj
  },
}

const messages: any = { ping, pong, findneighbours, neighbours, enrrequest, enrresponse }

type Types = { [index: string]: { [index: string]: number | string } }
const types: Types = {
  byName: {
    ping: 0x01,
    pong: 0x02,
    findneighbours: 0x03,
    neighbours: 0x04,
    enrrequest: 0x05,
    enrresponse: 0x06,
  },
  byType: {
    0x01: 'ping',
    0x02: 'pong',
    0x03: 'findneighbours',
    0x04: 'neighbours',
    0x05: 'enrrequest',
    0x06: 'enrresponse',
  },
}

// [0, 32) data hash
// [32, 96) signature
// 96 recoveryId
// 97 type
// [98, length) data

export function encode<T>(typename: string, data: T, privateKey: Uint8Array) {
  const type: number = types.byName[typename] as number
  if (type === undefined) throw new Error(`Invalid typename: ${typename}`)
  const encodedMsg = messages[typename].encode(data, privateKey)
  const typedata = concatBytes(Uint8Array.from([type]), RLP.encode(encodedMsg))

  const sighash = keccak256(typedata)
  const sig = ecdsaSign(sighash, privateKey)
  const hashdata = concatBytes(sig.signature, Uint8Array.from([sig.recid]), typedata)
  const hash = keccak256(hashdata)
  return concatBytes(hash, hashdata)
}

export function decode(bytes: Uint8Array) {
  const hash = keccak256(bytes.subarray(32))
  assertEq(bytes.subarray(0, 32), hash, 'Hash verification failed', debug)

  const typedata = bytes.subarray(97)
  const type = typedata[0]
  const typename = types.byType[type]
  if (typename === undefined) throw new Error(`Invalid type: ${type}`)
  const data = messages[typename].decode(unstrictDecode(typedata.subarray(1)))

  const sighash = keccak256(typedata)
  const signature = bytes.subarray(32, 96)
  const recoverId = bytes[96]
  const publicKey = ecdsaRecover(signature, recoverId, sighash, false)
  return { typename, data, publicKey }
}
