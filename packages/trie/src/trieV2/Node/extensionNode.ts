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
    this.debug(
      `ExtensionNode({ keyNibbles ${options.keyNibbles}, child }) created with keyNibbles=${
        this.keyNibbles
      }, key=${' '}, childNibbles=${this.child.getPartialKey()}`
    )
  }

  rlpEncode(): Uint8Array {
    this.debug(
      `ExtensionNode rlpEncode: keyNibbles=${this.keyNibbles} + child=${this.child.hash()}`
    )
    const encodedNode = RLP.encode([
      encodeNibbles(addPadding(this.keyNibbles)),
      this.child.rlpEncode(),
    ])
    this.debug(`ExtensionNode encoded: ${encodedNode}`)
    return encodedNode
  }

  hash(): Uint8Array {
    const encodedNode = this.rlpEncode()
    const hashed = keccak256(encodedNode)
    this.debug(`ExtensionNode hash: ${hashed}`)
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
      this.debug(
        ` key shares the same prefix as the existing key, get the child: ${this.child.getPartialKey()}`
      )
      const result = await this.child.get(encodeNibbles(key.slice(this.keyNibbles.length)))
      this.debug(`ExtensionNode get result: ${result === null ? 'null' : result}`)
      return result
    }
    this.debug(`ExtensionNode get result: null`)
    return null
  }

  async update(rawKey: Uint8Array, value: Uint8Array): Promise<TNode> {
    const keyNibbles = decodeNibbles(rawKey)
    const commonPrefixLength = matchingNibbleLength(this.keyNibbles, keyNibbles)

    if (commonPrefixLength === this.keyNibbles.length) {
      this.debug('The key shares the same prefix as the existing key, update the child')
      const updatedChild = await this.child.update(
        encodeNibbles(keyNibbles.slice(commonPrefixLength)),
        value
      )
      return new ExtensionNode({ keyNibbles: this.keyNibbles, subNode: updatedChild })
    } else {
      this.debug('The key has a different prefix, create a new branch node')
      const newLeaf = new LeafNode({ key: keyNibbles.slice(commonPrefixLength + 1), value })

      let updatedChild
      if (this.child instanceof LeafNode) {
        updatedChild = this.child.updateKey(this.keyNibbles.slice(commonPrefixLength + 1))
      } else if (this.child instanceof BranchNode) {
        updatedChild = this.child // no need to update the key, handled by the branch node
      } else {
        throw new Error('updateKey method not supported for this node type')
      }

      const branchNode = await BranchNode.fromTwoNodes(
        [this.keyNibbles[commonPrefixLength]],
        updatedChild,
        [keyNibbles[commonPrefixLength]],
        newLeaf
      )

      if (commonPrefixLength === 0) {
        return branchNode
      } else {
        return new ExtensionNode({
          keyNibbles: this.keyNibbles.slice(0, commonPrefixLength),
          subNode: branchNode,
        })
      }
    }
  }

  async delete(rawKey: Uint8Array): Promise<ExtensionNode | NullNode> {
    const key = decodeNibbles(rawKey)

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
