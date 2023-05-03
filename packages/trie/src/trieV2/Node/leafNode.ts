import { RLP } from '@ethereumjs/rlp'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { equalsBytes } from 'ethereum-cryptography/utils'

import { bytesToNibbles } from '../util'

import { BaseNode } from './index'

import type { Nibble, NodeInterface, TNode, TNodeOptions } from '../types'

export class LeafNode extends BaseNode implements NodeInterface<'LeafNode'> {
  type = 'LeafNode' as const
  key: Uint8Array
  keyNibbles: Nibble[]
  value: Uint8Array | null

  constructor(options: TNodeOptions<'LeafNode'>) {
    super(options)
    this.key = options.key
    this.keyNibbles = bytesToNibbles(options.key)
    this.value = options.value
    this.debug(`LeafNode created: key=${options.key}, value=${options.value}`)
  }

  encode(): Uint8Array {
    this.debug(`LeafNode encode: key=${this.key}, value=${this.value}`)
    const encodedNode = RLP.encode([this.key, this.value])
    this.debug(`LeafNode encoded: ${encodedNode}`)
    return encodedNode
  }

  hash(): Uint8Array {
    const encodedNode = this.encode()
    const hashed = keccak256(encodedNode)
    this.debug(`LeafNode hash: ${hashed}`)
    return hashed
  }

  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    this.debug(`LeafNode get: rawKey=${rawKey}`)
    const result = equalsBytes(rawKey, this.key) ? this.value : null
    this.debug(`LeafNode get result: ${result ? result : 'null'}`)
    return result
  }

  async getChildren(): Promise<Map<number, TNode>> {
    return new Map()
  }
  getPartialKey(): Nibble[] {
    return this.keyNibbles
  }
  async update(rawKey: Uint8Array, value: Uint8Array): Promise<LeafNode> {
    if (equalsBytes(this.key, rawKey)) {
      return new LeafNode({ key: this.key, value })
    }
    throw new Error('Key does not match the current LeafNode key')
  }
}
