import { RLP } from '@ethereumjs/rlp'
import { keccak256 } from 'ethereum-cryptography/keccak'

import {
  addPadding,
  concatNibbles,
  decodeNibbles,
  encodeNibbles,
  hasMatchingNibbles,
  matchingNibbleLength,
  nibblesEqual,
  unPad,
} from '../index'

import { BaseNode, BranchNode, LeafNode, NullNode } from './index'

import type { Nibble, NodeInterface, TNode, TNodeOptions } from '../index'

export class ExtensionNode extends BaseNode implements NodeInterface<'ExtensionNode'> {
  type = 'ExtensionNode' as const
  keyNibbles: Nibble[]
  // key: Uint8Array
  child: TNode

  constructor(options: TNodeOptions<'ExtensionNode'>) {
    super(options)
    this.keyNibbles = unPad(options.keyNibbles)
    this.child = options.subNode
    this.debug &&
      this.debug(
        `ExtensionNode({ keyNibbles ${options.keyNibbles}, child }) created with keyNibbles=${
          this.keyNibbles
        }, key=${' '}, childNibbles=${this.child.getPartialKey()}`
      )
  }

  rlpEncode(): Uint8Array {
    this.debug &&
      this.debug(
        `ExtensionNode rlpEncode: keyNibbles=${this.keyNibbles} + child=${this.child.hash()}`
      )
    const encodedNode = RLP.encode([
      encodeNibbles(addPadding(this.keyNibbles)),
      this.child.rlpEncode(),
    ])
    this.debug && this.debug(`ExtensionNode encoded: ${encodedNode}`)
    return encodedNode
  }

  hash(): Uint8Array {
    const encodedNode = this.rlpEncode()
    const hashed = keccak256(encodedNode)
    this.debug && this.debug(`ExtensionNode hash: ${hashed}`)
    return hashed
  }

  async getChildren(): Promise<Map<number, TNode>> {
    return new Map().set(0, this.child)
  }
  getPartialKey(): Nibble[] {
    return this.keyNibbles
  }
  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    const key = decodeNibbles(rawKey)

    if (nibblesEqual(key.slice(0, this.keyNibbles.length), this.keyNibbles)) {
      this.debug &&
        this.debug(
          ` key shares the same prefix as the existing key, get the child: ${this.child.getPartialKey()}`
        )
      const result = await this.child.get(encodeNibbles(key.slice(this.keyNibbles.length)))
      this.debug && this.debug(`ExtensionNode get result: ${result === null ? 'null' : result}`)
      return result
    }
    this.debug && this.debug(`ExtensionNode get result: null`)
    return null
  }

  async update(rawKey: Uint8Array, value: Uint8Array): Promise<TNode> {
    this.debug && this.debug(`ExtensionNode update: rawKey=${rawKey}, value=${value}`)
    const key = decodeNibbles(rawKey)
    const matching = matchingNibbleLength(this.keyNibbles, key)

    // If the entire key matches
    if (matching === this.keyNibbles.length && matching === key.length) {
      const updatedChild = await this.child.update(new Uint8Array(), value)
      return new ExtensionNode({ keyNibbles: this.keyNibbles, subNode: updatedChild })
    }

    // If there's a partial match
    if (matching > 0 && matching < this.keyNibbles.length) {
      const updatedChild = await this.child.update(encodeNibbles(key.slice(matching)), value)
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
      const updatedChild = await this.child.update(encodeNibbles(key.slice(matching)), value)
      return new ExtensionNode({ keyNibbles: this.keyNibbles, subNode: updatedChild })
    }

    // This line should not be reached, but we keep it to satisfy TypeScript
    return this
  }

  async delete(rawKey: Uint8Array): Promise<ExtensionNode | NullNode> {
    const key = decodeNibbles(rawKey)
    this.debug && this.debug(`ExtensionNode delete: rawKey:${rawKey}...decoded: ${key}`)
    this.debug && this.debug(`ExtensionNode: ${this.keyNibbles}`)

    if (!hasMatchingNibbles(this.keyNibbles, key)) {
      // The key does not match the extension node, return the original node
      return this
    }

    const remainingKey = key.slice(this.keyNibbles.length)
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
