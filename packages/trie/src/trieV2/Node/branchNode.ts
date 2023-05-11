import { RLP } from '@ethereumjs/rlp'
import { bytesToPrefixedHexString } from '@ethereumjs/util'
import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'

import { matchingNibbleLength } from '..'

import { BaseNode, ExtensionNode, LeafNode, NullNode } from './index'

import type { Nibble, NodeInterface, NodeType, TNode, TNodeOptions } from '../types'

export class BranchNode extends BaseNode implements NodeInterface<'BranchNode'> {
  type = 'BranchNode' as const
  keyNibbles: Nibble[]
  children: Array<TNode | undefined>
  value: Uint8Array | null
  static _sortChildren(children: TNode[]) {
    debug('BranchNode').extend('_sortChildren')(
      `unsorted: ` +
        JSON.stringify(
          children.map((child) => {
            return child.getPartialKey()
          })
        )
    )
    const sharedNibbleLength = Math.min(
      ...children.map((child, idx) => {
        return matchingNibbleLength(
          children[idx].getPartialKey(),
          children[(idx + 1) % children.length].getPartialKey()
        )
      })
    )

    const sortedChildren = new Array(16).fill(new NullNode())
    for (const child of children) {
      if (child.type === 'NullNode') continue
      const index = child.getPartialKey()[sharedNibbleLength]
      sortedChildren[index] = child
    }
    debug('BranchNode').extend('_sortChildren')(
      `sorted: ` +
        JSON.stringify(
          sortedChildren.map((child) => {
            return child.getPartialKey()
          })
        )
    )
    return sortedChildren
  }
  constructor(options?: TNodeOptions<'BranchNode'>) {
    super(options)
    this.keyNibbles = []
    this.children = []
    this.value = null
    this.debug && this.debug(`BranchNode created`)
  }
  getType(): NodeType {
    return 'BranchNode'
  }

  rlpEncode(): Uint8Array {
    const childrenRlp: Uint8Array[] = []
    for (let i = 0; i < 16; i++) {
      const child = this.children[i]
      if (child !== undefined) {
        childrenRlp.push(child.rlpEncode())
      } else {
        childrenRlp.push(new NullNode().rlpEncode())
      }
    }
    const encodedNode = RLP.encode([...childrenRlp, this.value ?? Uint8Array.from([])])
    return encodedNode
  }

  hash(): Uint8Array {
    const hashed = keccak256(this.rlpEncode())
    return hashed
  }
  getChildren(): Map<number, TNode> {
    const children: Map<number, TNode> = new Map()
    for (const [idx, child] of this.children.entries()) {
      if (child && child.type !== 'NullNode') {
        children.set(idx, child)
      }
    }
    return children
  }
  getChild(key: number): TNode | undefined {
    return this.children[key]
  }
  updateChild(newChild: TNode, nibble: Nibble): TNode {
    const curHash = this.hash()
    this.children[nibble] = newChild
    if (this.debug) {
      this.debug.extend('updateChild')(`new child on branch:${nibble}`)
      this.debug.extend('updateChild').extend(`${nibble}`)(`keyNibbles:${newChild.getPartialKey()}`)
      this.debug.extend('updateChild')(`oldHash=${bytesToPrefixedHexString(curHash)}`)
      this.debug.extend('updateChild')(`newHash=${bytesToPrefixedHexString(this.hash())}`)
    }
    return this
  }
  async deleteChild(nibble: Nibble) {
    const children = this.children
    children[nibble] = new NullNode()
    return new BranchNode({ children, value: this.value })
  }
  async updateValue(value: Uint8Array | null) {
    this.debug && this.debug.extend('updateValue')(`value=${value}`)
    this.value = value
    return new BranchNode({ children: this.children, value })
  }
  setChild(slot: number, node: TNode): BranchNode {
    this.updateChild(node, slot)
    return this
  }
  getValue(): Uint8Array | undefined {
    return this.value ?? undefined
  }
  getPartialKey(): Nibble[] {
    return this.keyNibbles
  }
  updateKey(newKeyNibbles: number[]): TNode {
    if (this.value) {
      // If the BranchNode has a value, it should be converted to a LeafNode
      return new LeafNode({ key: newKeyNibbles, value: this.value })
    } else {
      // If the BranchNode has no value, it should be converted to an ExtensionNode
      return new ExtensionNode({ keyNibbles: newKeyNibbles, subNode: this })
    }
  }
  async get(_rawKey: Uint8Array): Promise<Uint8Array | null> {
    throw new Error('Method to be removed.')
  }
  async update(value: Uint8Array): Promise<BranchNode> {
    const index = this.keyNibbles[0]
    this.debug && this.debug.extend('update')(`nibbles=${this.keyNibbles}, index=${index}`)
    if (this.keyNibbles.length === 0) {
      // The key matches the branch node exactly, update the value
      return new BranchNode({ children: this.children, value })
    } else {
      // The key does not match the branch node exactly, update the subtree
      const child = this.children[index!]
      const updatedChild = await child?.update(value)

      const updatedChildren = this.children.slice()
      updatedChildren[index!] = updatedChild
      return new BranchNode({ children: updatedChildren, value: this.value })
    }
  }
  async delete(_rawKey: Uint8Array): Promise<TNode> {
    throw new Error('Method to be removed.')
  }
}
