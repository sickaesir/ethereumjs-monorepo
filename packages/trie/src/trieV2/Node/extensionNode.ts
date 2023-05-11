import { RLP } from '@ethereumjs/rlp'
import { equalsBytes } from '@ethereumjs/util'
import { keccak256 } from 'ethereum-cryptography/keccak'

import {
  concatNibbles,
  decodeNibbles,
  encodeNibbles,
  hasMatchingNibbles,
  matchingNibbleLength,
  nibblesToKey,
} from '../index'

import { BaseNode, BranchNode, LeafNode, NullNode } from './index'

import type { Nibble, NodeInterface, NodeType, TNode, TNodeOptions } from '../index'

export class ExtensionNode extends BaseNode implements NodeInterface<'ExtensionNode'> {
  type = 'ExtensionNode' as const
  keyNibbles: Nibble[]
  child: TNode

  constructor(options: TNodeOptions<'ExtensionNode'>) {
    super(options)
    this.keyNibbles = options.keyNibbles
    this.child = options.subNode
    this.debug &&
      this.debug(`Created with keyNibbles=${this.keyNibbles}, child=${this.child.getType()}`)
  }

  rlpEncode(): Uint8Array {
    const encodedNode = RLP.encode([nibblesToKey(this.keyNibbles), this.child.rlpEncode()])
    return encodedNode
  }

  hash(): Uint8Array {
    const encodedNode = this.rlpEncode()
    const hashed = keccak256(encodedNode)
    return hashed
  }

  getChildren(): Map<number, TNode> {
    return new Map().set(0, this.child)
  }
  getChild(_key: number = 0): TNode {
    return this.child
  }
  getType(): NodeType {
    return 'ExtensionNode'
  }
  async deleteChild(_nibble: number): Promise<TNode> {
    return new NullNode()
  }
  updateChild(newNode: TNode): TNode {
    if (equalsBytes(newNode.hash(), this.child.hash())) {
      return this
    }
    const newKeyNibbles = this.keyNibbles.slice(1)
    if (newKeyNibbles.length === 0) {
      return newNode
    }
    const updatedNode = new ExtensionNode({ keyNibbles: newKeyNibbles, subNode: newNode })
    return updatedNode
  }
  async updateValue(_newValue: Uint8Array): Promise<TNode> {
    return this
  }
  updateKey(_newKey: Nibble[]): TNode {
    this.keyNibbles = _newKey
    return this
  }
  getValue(): Uint8Array | undefined {
    return undefined
  }
  getPartialKey(): Nibble[] {
    return this.keyNibbles
  }
  async get(_rawKey: Uint8Array): Promise<Uint8Array | null> {
    throw new Error('method to be deleted')
  }

  async update(value: Uint8Array): Promise<TNode> {
    this.debug && this.debug.extend('update')(`value=${value}`)
    const key = this.getPartialKey()
    const matching = matchingNibbleLength(this.keyNibbles, key)

    // If the entire key matches
    if (matching === this.keyNibbles.length && matching === key.length) {
      const updatedChild = await this.child.update(value)
      return new ExtensionNode({ keyNibbles: this.keyNibbles, subNode: updatedChild })
    }

    // If there's a partial match
    if (matching > 0 && matching < this.keyNibbles.length) {
      const updatedChild = await this.child.update(value)
      const newKeyNibbles = this.keyNibbles.slice(0, matching)
      const branch = new BranchNode({
        children: [
          ...Array(matching).fill(new NullNode()),
          new ExtensionNode({ keyNibbles: this.keyNibbles.slice(matching), subNode: updatedChild }),
          new ExtensionNode({
            keyNibbles: key.slice(matching),
            subNode: new LeafNode({ key: [], value }),
          }),
          ...Array(16 - matching - 2).fill(new NullNode()),
        ],
        value: null,
      })

      return newKeyNibbles.length > 0
        ? new ExtensionNode({ keyNibbles: newKeyNibbles, subNode: branch })
        : branch
    }

    // If the keys don't match at all
    if (matching === 0) {
      const branch = new BranchNode({
        children: [
          ...Array(this.keyNibbles[0]).fill(new NullNode()),
          this,
          new LeafNode({ key: key.slice(1), value }),
          ...Array(15 - this.keyNibbles[0]).fill(new NullNode()),
        ],
        value: null,
      })

      return branch
    }

    // If the extension key is a prefix of the new key
    if (matching === this.keyNibbles.length) {
      const updatedChild = await this.child.update(value)
      return new ExtensionNode({ keyNibbles: this.keyNibbles, subNode: updatedChild })
    }

    // This line should not be reached, but we keep it to satisfy TypeScript
    return this
  }

  async delete(rawKey: Uint8Array): Promise<ExtensionNode | NullNode> {
    const key = decodeNibbles(rawKey)
    this.debug && this.debug.extend('delete')(`[${key}]`)

    if (!hasMatchingNibbles(this.keyNibbles, key)) {
      this.debug && this.debug.extend('delete')(`key does not match`)
      // The key does not match the extension node, return the original node
      return this
    }

    const remainingKey = key.slice(this.keyNibbles.length)
    this.debug && this.debug.extend('delete')(`remainingKey=${remainingKey}`)
    const updatedChild = await this.child.delete(encodeNibbles(remainingKey))

    if (updatedChild instanceof NullNode) {
      // If the updated child is a NullNode, delete the current extension node
      return updatedChild
    }

    if (updatedChild instanceof LeafNode) {
      // If the updated child is a LeafNode, merge its key with the current extension node's partialKey
      const newPartialKey = concatNibbles(this.getPartialKey(), updatedChild.getPartialKey())
      return new ExtensionNode({ keyNibbles: newPartialKey, subNode: updatedChild })
    }

    // In all other cases, return the updated extension node with the updated child
    return new ExtensionNode({ keyNibbles: this.getPartialKey(), subNode: updatedChild })
  }
}
