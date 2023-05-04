import { RLP } from '@ethereumjs/rlp'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { equalsBytes } from 'ethereum-cryptography/utils'

import { bytesToNibbles, encodeNibbles, nibblesCompare } from '../index'

import { BaseNode } from './index'

import type { Nibble, NodeInterface, TNode, TNodeOptions } from '../index'

export class ExtensionNode extends BaseNode implements NodeInterface<'ExtensionNode'> {
  type = 'ExtensionNode' as const
  keyNibbles: Nibble[]
  key: Uint8Array
  child: TNode

  constructor(options: TNodeOptions<'ExtensionNode'>) {
    super(options)
    this.key = encodeNibbles(options.keyNibbles)
    this.keyNibbles = options.keyNibbles
    this.child = options.subNode
    this.debug(`ExtensionNode created: key=${this.key}, child=${this.child.hash()}`)
  }

  rlpEncode(): Uint8Array {
    this.debug(`ExtensionNode rlpEncode: key=${this.key}, child=${this.child.hash()}`)
    const encodedNode = RLP.encode([this.key, this.child.rlpEncode()])
    this.debug(`ExtensionNode encoded: ${encodedNode}`)
    return encodedNode
  }

  hash(): Uint8Array {
    const encodedNode = this.rlpEncode()
    const hashed = keccak256(encodedNode)
    this.debug(`ExtensionNode hash: ${hashed}`)
    return hashed
  }

  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    this.debug(`ExtensionNode get: rawKey=${rawKey}`)
    if (equalsBytes(rawKey.slice(0, this.key.length), this.key)) {
      const result = await this.child.get(rawKey.slice(this.key.length))
      this.debug(`ExtensionNode get result: ${result === null ? 'null' : result}`)
      return result
    }
    this.debug(`E xtensionNode get result: null`)
    return null
  }
  async getChildren(): Promise<Map<number, TNode>> {
    return new Map().set(0, this.child)
  }
  getPartialKey(): Nibble[] {
    return this.keyNibbles
  }

  async update(rawKey: Uint8Array, value: Uint8Array): Promise<TNode> {
    if (
      nibblesCompare(bytesToNibbles(rawKey).slice(0, this.keyNibbles.length), this.keyNibbles) === 0
    ) {
      const updatedChild = await this.child.update(rawKey.slice(this.keyNibbles.length), value)
      return new ExtensionNode({ keyNibbles: this.keyNibbles, subNode: updatedChild })
    }
    throw new Error('Key does not have the same prefix as the ExtensionNode partialKey')
  }
}
