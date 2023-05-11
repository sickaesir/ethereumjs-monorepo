import { RLP } from '@ethereumjs/rlp'
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
  constructor(_args: any) {
    this.type = 'NullNode'
    this.debug = debug(this.constructor.name)
    if (!this.debug.enabled) {
      this.debug = undefined
    }
    this.hashFunction = keccak256
  }
  abstract get(rawKey?: Uint8Array): Promise<Uint8Array | null>
  abstract rlpEncode(): Uint8Array
  abstract update(value: Uint8Array): Promise<TNode>
  abstract getChild(key?: number): TNode | undefined
  abstract deleteChild(nibble: Nibble): Promise<TNode>
  abstract updateChild(newChild: TNode, nibble?: Nibble): TNode
  abstract updateValue(newValue: Uint8Array | null): Promise<TNode>
  abstract getChildren(): Map<number, TNode>
  abstract getValue(): Uint8Array | undefined
  abstract getPartialKey(): Nibble[]
  abstract getType(): NodeType
  abstract delete(rawKey?: Uint8Array): Promise<TNode>
}

export class NullNode extends BaseNode {
  type: 'NullNode' = 'NullNode'
  constructor() {
    super({})
  }
  rlpEncode(): Uint8Array {
    return RLP.encode(Uint8Array.from([]))
  }
  hash(): Uint8Array {
    return this.hashFunction(this.rlpEncode())
  }
  async get(): Promise<Uint8Array | null> {
    return null
  }
  getChildren(): Map<number, TNode> {
    return new Map()
  }
  getChild(_key: number): TNode {
    return new NullNode()
  }
  getType(): NodeType {
    return 'NullNode'
  }
  updateChild(_newChild: TNode, _nibble?: Nibble): TNode {
    throw new Error('Cannot update child of NullNode')
  }
  async deleteChild(_nibble: Nibble) {
    return this
  }
  async updateValue(_newValue: Uint8Array): Promise<TNode> {
    return this
  }
  getPartialKey(): Nibble[] {
    return []
  }
  getValue(): Uint8Array | undefined {
    return undefined
  }
  async update(value: Uint8Array): Promise<TNode> {
    const newNode = await TrieNode.create({ key: decodeNibbles(this.hashFunction(value)), value })
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
