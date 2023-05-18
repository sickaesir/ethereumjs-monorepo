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
      if (child === null || child.type === 'NullNode') continue
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
    this.children = options?.children ?? []
    this.value = options?.value ?? null
    this.debug && this.debug(`BranchNode created`)
  }
  getType(): NodeType {
    return 'BranchNode'
  }

  encodeChild(child: TNode | undefined): Uint8Array | Uint8Array[] {
    if (child === undefined) return Uint8Array.from([])
    switch (child.getType()) {
      case 'BranchNode':
        return child.rlpEncode().length >= 32 ? child.hash() : (child.raw() as Uint8Array[])
      case 'LeafNode':
        // return child.hash()
        return child.rlpEncode().length >= 32 ? child.hash() : (child.raw() as Uint8Array[])
      case 'ExtensionNode':
        return child.rlpEncode().length >= 32 ? child.hash() : (child.raw() as Uint8Array[])
      case 'NullNode':
      default:
        return Uint8Array.from([])
    }
  }
  childrenRlp(): (Uint8Array | Uint8Array[])[] {
    const children: (Uint8Array | Uint8Array[])[] = Array.from({ length: 16 }, (_, _i) => {
      return Uint8Array.from([])
    })
    for (const [idx, child] of this.children.entries()) {
      children[idx] = this.encodeChild(child)
    }
    return children
  }
  raw(): any {
    const childrenRlp = this.childrenRlp()
    // this.debug!.extend('raw')([...[...childrenRlp, this.value].entries()])
    return [...childrenRlp, this.value ?? Uint8Array.from([])]
  }
  rlpEncode(): Uint8Array {
    const encodedNode = RLP.encode(this.raw())
    return encodedNode
  }

  hash(): Uint8Array {
    const hashed = keccak256(this.rlpEncode())
    return hashed
  }
  getChildren(): Map<number, TNode> {
    const children: Map<number, TNode> = new Map()
    for (let i = 0; i < 16; i++) {
      const child = this.children[i]
      if (child === undefined || child.getType() !== 'NullNode') {
        continue
      }
      children.set(i, child)
    }
    return children
  }
  getChild(key: number): TNode | undefined {
    return this.children[key]
  }
  childNodes(): Map<number, TNode> {
    const children: Map<number, TNode> = new Map()
    for (let i = 0; i < 16; i++) {
      const child = this.children[i]
      if (child !== undefined && child.getType() !== 'NullNode') {
        children.set(i, child)
      }
    }
    return children
  }
  updateChild(newChild: TNode, nibble: Nibble): TNode {
    const curHash = this.hash()
    this.children[nibble] = newChild.getType() === 'NullNode' ? undefined : newChild
    if (this.debug) {
      this.debug.extend('updateChild')(
        `updating child on branch:${nibble} to ${newChild.getType()}`
      )
      this.debug.extend('updateChild').extend(`${nibble}`)(
        `keyNibbles(${newChild.getPartialKey().length}):${newChild.getPartialKey()}`
      )
      // this.debug.extend('updateChild')(`oldHash=${bytesToPrefixedHexString(curHash)}`)
      // this.debug.extend('updateChild')(`newHash=${bytesToPrefixedHexString(this.hash())}`)
    }
    return new BranchNode({ children: this.children, value: this.value })
  }
  async deleteChild(nibble: Nibble): Promise<TNode> {
    const children = this.children
    children[nibble] = undefined
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
  getValue(): Uint8Array | null {
    return this.value
  }
  getPartialKey(): Nibble[] {
    return this.keyNibbles
  }
  async updateKey(newKeyNibbles: number[]): Promise<TNode> {
    // if (this.value) {
    // If the BranchNode has a value, it should be converted to a LeafNode
    //   return new LeafNode({ key: newKeyNibbles, value: this.value })
    // } else {
    // If the BranchNode has no value, it should be converted to an ExtensionNode
    return new ExtensionNode({ keyNibbles: newKeyNibbles, subNode: this })
    // }
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
