import { RLP } from '@ethereumjs/rlp'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { equalsBytes } from 'ethereum-cryptography/utils'

import { addHexPrefix } from '../../util/hex'
import { decodeNibbles, encodeNibbles, nibblesEqual } from '../util'

import { BaseNode, NullNode } from './index'

import type { Nibble, NodeInterface, NodeType, TNode, TNodeOptions } from '../types'

export class LeafNode extends BaseNode implements NodeInterface<'LeafNode'> {
  type = 'LeafNode' as const
  keyNibbles: Nibble[]
  value: Uint8Array | null
  constructor(options: TNodeOptions<'LeafNode'>) {
    super(options)
    this.keyNibbles = options.key
    this.value = options.value
    this.debug && this.debug(`Created with keyNibbles: ${this.keyNibbles}`)
  }
  prefixedNibbles(): Nibble[] {
    const nibbles = this.keyNibbles
    return addHexPrefix(nibbles, true)
  }
  encodedKey(): Uint8Array {
    return encodeNibbles(this.prefixedNibbles())
  }
  raw(): Uint8Array[] {
    return [this.encodedKey(), this.getValue()]
  }
  rlpEncode(): Uint8Array {
    const encodedNode = RLP.encode(this.raw())
    return encodedNode
  }
  hash(): Uint8Array {
    const hashed = keccak256(this.rlpEncode())
    return hashed
  }
  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    const result = equalsBytes(this.encodedKey(), rawKey) ? this.value : null
    return result
  }
  getChildren(): Map<number, TNode> {
    return new Map()
  }
  getChild(_key: number): TNode {
    throw new Error('LeafNode does not have children')
  }
  getValue(): Uint8Array {
    return this.value ?? Uint8Array.from([])
  }
  getPartialKey(): Nibble[] {
    return this.keyNibbles
  }
  getType(): NodeType {
    return 'LeafNode'
  }
  async update(value: Uint8Array | null): Promise<LeafNode> {
    return new LeafNode({ key: this.keyNibbles, value })
  }
  async updateValue(value: Uint8Array | null): Promise<LeafNode> {
    return new LeafNode({ key: this.keyNibbles, value })
  }
  updateChild(_node: TNode = new NullNode()): TNode {
    throw new Error('LeafNode does not have children')
  }
  async deleteChild(_nibble: Nibble): Promise<TNode> {
    return this
  }
  async updateKey(newKeyNibbles: Nibble[]): Promise<LeafNode> {
    return new LeafNode({ key: newKeyNibbles, value: this.getValue() })
  }
  async delete(rawKey: Uint8Array): Promise<TNode> {
    const key = decodeNibbles(rawKey)
    if (nibblesEqual(this.getPartialKey(), key)) {
      return new NullNode()
    }
    return this
  }
}
