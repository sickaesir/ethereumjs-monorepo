import { RLP } from '@ethereumjs/rlp'
import { keccak256 } from 'ethereum-cryptography/keccak'

import { firstNibble } from '..'

import { BaseNode, LeafNode } from './index'

import type { Nibble, NodeInterface, TNode, TNodeOptions } from '../types'

export class BranchNode extends BaseNode implements NodeInterface<'BranchNode'> {
  type = 'BranchNode' as const
  keyNibbles: Nibble[]
  children: Array<TNode | null>
  value: Uint8Array | null

  static async fromTwoNodes(
    key1: Uint8Array | Nibble[],
    node1: TNode,
    key2: Uint8Array | Nibble[],
    node2: TNode
  ): Promise<BranchNode> {
    const branch = new BranchNode({ children: [], value: null })
    branch.setChild(key1[0], node1)
    branch.setChild(key2[0], node2)
    return branch
  }
  constructor(options: TNodeOptions<'BranchNode'>) {
    super(options)
    this.keyNibbles = []
    this.children = options.children
    this.value = options.value
    this.debug(
      `BranchNode created: children=[${this.children
        .map((child, i) => (child ? `${i}: ${child.hash()}` : ''))
        .join(', ')}], value=${this.value ? this.value : 'null'}`
    )
  }

  encode(): Uint8Array {
    this.debug(
      `BranchNode encode: children=[${this.children
        .map((child, i) => (child ? `${i}: ${child.hash()}` : ''))
        .join(', ')}], value=${this.value ? this.value : 'null'}`
    )
    const encodedNode = RLP.encode([
      ...this.children.map((child) => (child ? child.encode() : Uint8Array.from([]))),
      this.value ?? Uint8Array.from([]),
    ])
    this.debug(`BranchNode encoded: ${encodedNode}`)
    return encodedNode
  }

  hash(): Uint8Array {
    const encodedNode = this.encode()
    const hashed = keccak256(encodedNode)
    this.debug(`BranchNode hash: ${hashed}`)
    return hashed
  }
  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    this.debug(`BranchNode get: rawKey=${rawKey}`)
    if (rawKey.length === 0) {
      this.debug(`BranchNode get result: ${this.value ? this.value : 'null'}`)
      return this.value
    }
    const index = rawKey[0]
    const child = this.children[index]
    if (child) {
      const result = await child.get(rawKey.slice(1))
      this.debug(`BranchNode get result: ${result ? result : 'null'}`)
      return result
    }
    this.debug(`BranchNode get result: null`)
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
    const index = firstNibble(rawKey)
    const updatedBranches = this.children.slice()

    if (updatedBranches[index] !== null) {
      updatedBranches[index] = await updatedBranches[index]!.update(rawKey.slice(1), value)
    } else {
      updatedBranches[index] = new LeafNode({ key: rawKey.slice(1), value })
    }

    return new BranchNode({ children: updatedBranches, value: this.value })
  }
}
