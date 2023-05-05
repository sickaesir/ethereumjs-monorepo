import { RLP } from '@ethereumjs/rlp'
import { keccak256 } from 'ethereum-cryptography/keccak'

import { decodeNibbles, encodeNibbles, firstNibble, matchingNibbleLength } from '..'

import { BaseNode, LeafNode, NullNode } from './index'

import type { Nibble, NodeInterface, TNode, TNodeOptions } from '../types'

export class BranchNode extends BaseNode implements NodeInterface<'BranchNode'> {
  type = 'BranchNode' as const
  keyNibbles: Nibble[]
  children: Array<TNode>
  value: Uint8Array | null

  static async fromTwoNodes(
    key1: Uint8Array | Nibble[],
    node1: Exclude<TNode, 'BranchNode'>,
    key2: Uint8Array | Nibble[],
    node2: Exclude<TNode, 'BranchNode'>
  ): Promise<BranchNode> {
    const branch = new BranchNode({ children: [], value: null })
    const nibble1 = key1 instanceof Uint8Array ? firstNibble(key1) : key1[0]
    const nibble2 = key2 instanceof Uint8Array ? firstNibble(key2) : key2[0]
    branch.setChild(nibble1, node1)
    branch.setChild(nibble2, node2)
    return branch
  }
  constructor(options: TNodeOptions<'BranchNode'>) {
    super(options)
    this.keyNibbles = []
    this.children = this._sortChildren(options.children)
    this.value = options.value
    this.debug &&
      this.debug(
        `BranchNode created: children=[${this.children
          .map((child, i) => (child.type !== 'NullNode' ? `${i}: ${child.hash()}` : ''))
          .join(', ')}], value=${this.value ? this.value : 'null'}`
      )
  }

  _sortChildren(children: TNode[]) {
    this.debug && this.debug('BranchNode _sortChildren: ' + JSON.stringify(children))
    const sortedChildren = new Array(16).fill(new NullNode())
    for (const child of children) {
      if (child.type === 'NullNode') continue
      const index = child.getPartialKey()[0]
      sortedChildren[index] = child
    }
    return sortedChildren
  }

  rlpEncode(): Uint8Array {
    this.debug &&
      this.debug(
        `BranchNode rlpEncode: children=[${this.children
          .map((child, i) => (child.type !== 'NullNode' ? `${i}: ${child.hash()}` : ''))
          .join(', ')}], value=${this.value ? this.value : 'null'}`
      )
    const encodedNode = RLP.encode([
      ...this.children.map((child) =>
        child.type !== 'NullNode' ? child.rlpEncode() : Uint8Array.from([])
      ),
      this.value ?? Uint8Array.from([]),
    ])
    this.debug && this.debug(`BranchNode encoded: ${encodedNode}`)
    return encodedNode
  }

  hash(): Uint8Array {
    const encodedNode = this.rlpEncode()
    const hashed = keccak256(encodedNode)
    this.debug && this.debug(`BranchNode hash: ${hashed}`)
    return hashed
  }
  async getChildren(): Promise<Map<number, TNode>> {
    const children: Map<number, TNode> = new Map()
    for await (const [idx, child] of this.children.entries()) {
      if (child.type !== 'NullNode') {
        children.set(idx, child)
      }
    }
    return children
  }
  getChild(slot: number): TNode {
    return this.children[slot]
  }
  setChild(slot: number, node: TNode) {
    this.children[slot] = node
  }
  getPartialKey(): Nibble[] {
    return []
  }
  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    if (rawKey.length === 0) {
      this.debug && this.debug(`BranchNode get result: this.value = ${this.value}`)
      return this.value
    }
    const key = decodeNibbles(rawKey)
    const matching = matchingNibbleLength(this.keyNibbles, key)
    const index = key[matching]
    this.debug && this.debug(`BranchNode get: rawKey=[${[...rawKey.values()]}], key=${key}`)
    if (key.length === 1 && matching === 1) {
      this.debug &&
        this.debug(
          `BranchNode (keyNibbles: ${this.keyNibbles}) get result: this.value = ${this.value}`
        )
      return this.value
    }
    this.debug && this.debug(`BranchNode get: index=${index}`)
    const child = this.children[index]
    if (child.type !== 'NullNode') {
      this.debug &&
        this.debug(
          `Child found at index=${index}...childNode.get(${encodeNibbles(key.slice(matching + 1))})`
        )
      const result = await child.get(encodeNibbles(key.slice(matching)))

      return result
    }
    this.debug && this.debug(`BranchNode (keyNibbles: ${this.keyNibbles}) get result: null`)
    return null
  }

  async update(rawKey: Uint8Array, value: Uint8Array): Promise<BranchNode> {
    const nibbles = decodeNibbles(rawKey)
    const index = nibbles[0]
    this.debug && this.debug(`BranchNode update: nibbles=${nibbles}, index=${index}`)
    if (nibbles.length === 0) {
      // The key matches the branch node exactly, update the value
      return new BranchNode({ children: this.children, value })
    } else {
      // The key does not match the branch node exactly, update the subtree
      const child = this.children[index!]
      const updatedChild = await child.update(rawKey, value)

      const updatedChildren = this.children.slice()
      updatedChildren[index!] = updatedChild
      return new BranchNode({ children: updatedChildren, value: this.value })
    }
  }

  async delete(rawKey: Uint8Array): Promise<TNode> {
    this.debug && this.debug(`BranchNode delete: rawKey=${rawKey}`)
    const key = decodeNibbles(rawKey)
    const index = key[0]
    this.debug && this.debug(`BranchNode delete: nibbles=${key.toString()} index=${index}`)

    const child = this.children[index]
    if (key.slice(1).length === 0) {
      this.debug && this.debug(`The key matches the branch node exactly, delete the value`)

      const updatedChildren = this.children.slice()
      updatedChildren[index] = new NullNode()
      return new BranchNode({ children: updatedChildren, value: this.value })
    } else if (child.type !== 'NullNode') {
      this.debug && this.debug(`The key matches a non-null Node, delete from the subtree`)
      // The key does not match the branch node exactly, delete from the subtree
      const updatedChild = await child.delete(encodeNibbles(key))
      const updatedChildren = this.children.slice()
      updatedChildren[index] = updatedChild
      let nonNullChildren = 0
      let lastNonNullIndex = -1

      for (let i = 0; i < updatedChildren.length; i++) {
        if (updatedChildren[i].type !== 'NullNode') {
          nonNullChildren++
          lastNonNullIndex = i
        }
      }

      if (nonNullChildren === 1 && this.value === null) {
        const lastChild = updatedChildren[lastNonNullIndex]
        if (lastChild.type === 'LeafNode') {
          const newLeafKey = [lastNonNullIndex, ...lastChild.getPartialKey()]
          return new LeafNode({ key: newLeafKey, value: lastChild.value })
        }
      }

      return new BranchNode({ children: updatedChildren, value: this.value })
    }

    // If the child does not exist, return the branch node unchanged
    return this
  }
}
