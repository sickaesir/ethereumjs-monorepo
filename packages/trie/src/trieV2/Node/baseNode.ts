import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'

import { decodeNibbles } from '../util'

import { TrieNode } from './trieNode'

import type { HashFunction, Nibble, NodeType, TNode } from '../types'
import type { Debugger } from 'debug'

export abstract class BaseNode {
  public type: NodeType
  debug: Debugger | undefined
  hashFunction: HashFunction
  constructor(args: any) {
    this.type = 'NullNode'
    this.debug = debug(this.constructor.name)
    if (!this.debug.enabled) {
      this.debug = undefined
    }
    this.hashFunction = args.hashFunction ?? keccak256
  }
  abstract get(rawKey?: Uint8Array): Promise<Uint8Array | null>
  abstract rlpEncode(): Uint8Array
  abstract update(rawKey: Uint8Array, value: Uint8Array): Promise<TNode>
  abstract getChildren(): Promise<Map<number, TNode>>
  abstract getPartialKey(): Nibble[]
  abstract delete(rawKey?: Uint8Array): Promise<TNode>
}

export class NullNode extends BaseNode {
  type: 'NullNode' = 'NullNode'
  constructor() {
    super({})
  }
  rlpEncode(): Uint8Array {
    return Uint8Array.from([])
  }
  hash(): Uint8Array {
    return this.hashFunction(this.rlpEncode())
  }
  async get(): Promise<Uint8Array | null> {
    return null
  }
  async getChildren(): Promise<Map<number, TNode>> {
    return new Map()
  }
  getPartialKey(): Nibble[] {
    return []
  }
  async update(key: Uint8Array, value: Uint8Array): Promise<TNode> {
    const newNode = await TrieNode.create({ key: decodeNibbles(key), value })
    return newNode
  }
  async delete() {
    return this
  }
}

export class ProofNode extends NullNode {
  _hash: Uint8Array
  constructor(hash: Uint8Array) {
    super()
    this._hash = hash
  }
  hash(): Uint8Array {
    return this._hash
  }
}
