import { RLP } from '@ethereumjs/rlp'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { equalsBytes } from 'ethereum-cryptography/utils'

import { decodeNibbles, encodeNibbles, nibblesEqual } from '../util'

import { BaseNode, NullNode } from './index'

import type { Nibble, NodeInterface, TNode, TNodeOptions } from '../types'

export class LeafNode extends BaseNode implements NodeInterface<'LeafNode'> {
  type = 'LeafNode' as const
  key: Uint8Array
  keyNibbles: Nibble[]
  value: Uint8Array | null

  constructor(options: TNodeOptions<'LeafNode'>) {
    super(options)
    this.key = encodeNibbles(options.key)
    this.keyNibbles = options.key
    this.value = options.value
    this.debug && this.debug(`LeafNode created: key=${options.key}, value=${options.value}`)
  }

  rlpEncode(): Uint8Array {
    this.debug && this.debug(`LeafNode encode: key=${this.key}, value=${this.value}`)
    const encodedNode = RLP.encode([this.key, this.value])
    this.debug && this.debug(`LeafNode encoded: ${encodedNode}`)
    return encodedNode
  }

  hash(): Uint8Array {
    const encodedNode = this.rlpEncode()
    const hashed = keccak256(encodedNode)
    this.debug && this.debug(`LeafNode hash: ${hashed}`)
    return hashed
  }

  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    this.debug && this.debug(`LeafNode get: rawKey=${rawKey}`)
    const result = equalsBytes(this.key, rawKey) ? this.value : null
    this.debug && this.debug(`LeafNode get result: ${result ? result : 'null'}`)
    return result
  }

  async getChildren(): Promise<Map<number, TNode>> {
    return new Map()
  }
  getPartialKey(): Nibble[] {
    return this.keyNibbles
  }
  async update(rawKey: Uint8Array, value: Uint8Array): Promise<LeafNode> {
    return new LeafNode({ key: decodeNibbles(rawKey), value })
  }
  updateKey(newKeyNibbles: Nibble[]): LeafNode {
    return new LeafNode({ key: newKeyNibbles, value: this.value })
  }

  async delete(rawKey: Uint8Array): Promise<TNode> {
    const key = decodeNibbles(rawKey)
    if (nibblesEqual(this.getPartialKey(), key)) {
      return new NullNode()
    }
    return this
  }
}
