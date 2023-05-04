import { RLP } from '@ethereumjs/rlp'
import { keccak256 } from 'ethereum-cryptography/keccak'

import { addPadding, decodeNibbles, encodeNibbles, firstNibble } from '..'

import { BaseNode, TrieNode } from './index'

import type { Nibble, NodeInterface, TNode, TNodeOptions } from '../types'

export class BranchNode extends BaseNode implements NodeInterface<'BranchNode'> {
  type = 'BranchNode' as const
  keyNibbles: Nibble[]
  children: Array<TNode | null>
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
    this.children = options.children
    this.value = options.value
    this.debug &&
      this.debug(
        `BranchNode created: children=[${this.children
          .map((child, i) => (child ? `${i}: ${child.hash()}` : ''))
          .join(', ')}], value=${this.value ? this.value : 'null'}`
      )
  }

  rlpEncode(): Uint8Array {
    this.debug &&
      this.debug(
        `BranchNode rlpEncode: children=[${this.children
          .map((child, i) => (child ? `${i}: ${child.hash()}` : ''))
          .join(', ')}], value=${this.value ? this.value : 'null'}`
      )
    const encodedNode = RLP.encode([
      ...this.children.map((child) => (child ? child.rlpEncode() : Uint8Array.from([]))),
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
  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    const key = decodeNibbles(rawKey)
    this.debug && this.debug(`BranchNode get: rawKey=[${[...rawKey.values()]}], key=${key}`)
    if (rawKey.length === 0) {
      this.debug && this.debug(`BranchNode get result: ${this.value ? this.value : 'null'}`)
      return this.value
    }
    const index = key[0]
    this.debug && this.debug(`BranchNode get: index=${index}`)
    const child = this.children[index]
    if (child) {
      this.debug &&
        this.debug(
          `Child found at index=${index}...childNode.get(${encodeNibbles(
            addPadding(key).slice(1)
          )})`
        )
      const result = await child.get(encodeNibbles(addPadding(key).slice(1)))
      return result
    }
    this.debug && this.debug(`BranchNode get result: null`)
    return null
  }

  async getChildren(): Promise<Map<number, TNode>> {
    const children: Map<number, TNode> = new Map()
    for await (const [idx, child] of this.children.entries()) {
      if (child !== null) {
        children.set(idx, child)
      }
    }
    return children
  }
  getChild(slot: number): TNode | null {
    return this.children[slot]
  }
  setChild(slot: number, node: TNode) {
    this.children[slot] = node
  }
  getPartialKey(): Nibble[] {
    return []
  }
  async update(rawKey: Uint8Array, value: Uint8Array): Promise<BranchNode> {
    this.debug && this.debug(`BranchNode update: rawKey=${rawKey}, value=${value}`)
    const key = decodeNibbles(rawKey)
    const index = key[0]
    this.debug && this.debug(`BranchNode update: nibbles=${key.toString()} index=${index}`)
    if (key.length === 0) {
      this.debug && this.debug(`The key matches the branch node exactly, update the value`)
      return new BranchNode({ children: this.children, value })
    } else {
      this.debug && this.debug(`The key does not match the branch node exactly, update the subtree`)
      const child = this.children[index]
      if (child !== null) {
        const updatedChild = await child.update(encodeNibbles(key.slice(1)), value)
        const updatedChildren = this.children
        updatedChildren[index] = updatedChild
        return new BranchNode({ children: updatedChildren, value: this.value })
      } else {
        this.debug && this.debug(` Create a new leaf node and add it to the branch`)
        const newLeaf = await TrieNode.create({ key: key.slice(1), value })
        const updatedChildren = this.children
        updatedChildren[index] = newLeaf
        return new BranchNode({ children: updatedChildren, value: this.value })
      }
    }
  }
  async delete(rawKey: Uint8Array): Promise<TNode> {
    this.debug && this.debug(`BranchNode delete: rawKey=${rawKey}`)
    const key = decodeNibbles(rawKey)
    const index = key[0]
    this.debug && this.debug(`BranchNode delete: nibbles=${key.toString()} index=${index}`)
    if (key.length === 1) {
      // The key matches the branch node exactly, delete the value
      return new BranchNode({ children: this.children, value: null })
    } else {
      // The key does not match the branch node exactly, delete from the subtree
      const child = this.children[index]
      if (child) {
        const updatedChild = await child.delete(rawKey.slice(1))
        const updatedChildren = this.children.slice()
        updatedChildren[index] = updatedChild
        return new BranchNode({ children: updatedChildren, value: this.value })
      }
    }

    // If the child does not exist, return the branch node unchanged
    return this
  }
}
