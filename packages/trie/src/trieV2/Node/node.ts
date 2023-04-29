import { RLP } from '@ethereumjs/rlp'
import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { equalsBytes } from 'ethereum-cryptography/utils'

import type { Debugger } from 'debug'

const nodeTypes = {
  LEAF: 'LEAF',
  BRANCH: 'BRANCH',
  EXTENSION: 'EXTENSION',
} as const

export type NodeType = keyof typeof nodeTypes

export type HashFunction = (data: Uint8Array) => Uint8Array

export interface NodeOptions {
  hashFunction?: HashFunction
}

export abstract class Node<T extends NodeType = NodeType> {
  protected debug: Debugger
  protected hashFunction: HashFunction
  constructor(options: NodeOptions = {}) {
    this.debug = debug('NODE').extend(nodeTypes[this.constructor.name as T])
    this.hashFunction = options.hashFunction ?? keccak256
  }
  abstract encode(): Uint8Array
  abstract decode(encodedNode: Uint8Array): Node
  abstract hash(): Uint8Array
  abstract get(rawKey: Uint8Array): Promise<Uint8Array | null>
}

export class LeafNode extends Node {
  key: Uint8Array
  value: Uint8Array

  constructor(key: Uint8Array, value: Uint8Array) {
    super()
    this.key = key
    this.value = value
    this.debug.log(`LeafNode created: key=${key}, value=${value}`)
  }

  encode(): Uint8Array {
    this.debug.log(`LeafNode encode: key=${this.key}, value=${this.value}`)
    const encodedNode = RLP.encode([this.key, this.value])
    this.debug.log(`LeafNode encoded: ${encodedNode}`)
    return encodedNode
  }

  decode(encodedNode: Uint8Array): Node {
    this.debug.log(`LeafNode decode: encodedNode=${encodedNode}`)
    const [key, value] = RLP.decode(encodedNode) as [Uint8Array, Uint8Array]
    this.debug.log(`LeafNode decoded: key=${key}, value=${value}`)
    return new LeafNode(key, value)
  }

  hash(): Uint8Array {
    const encodedNode = this.encode()
    const hashed = keccak256(encodedNode)
    this.debug.log(`LeafNode hash: ${hashed}`)
    return hashed
  }

  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    this.debug.log(`LeafNode get: rawKey=${rawKey}`)
    const result = equalsBytes(rawKey, this.key) ? this.value : null
    this.debug.log(`LeafNode get result: ${result ? result : 'null'}`)
    return result
  }
}

export class BranchNode extends Node {
  children: Array<Node | null>
  value: Uint8Array | null

  constructor(children: Array<Node | null>, value: Uint8Array | null) {
    super()
    this.children = children
    this.value = value
    this.debug.log(
      `BranchNode created: children=[${children
        .map((child, i) => (child ? `${i}: ${child.hash()}` : ''))
        .join(', ')}], value=${value ? value : 'null'}`
    )
  }

  encode(): Uint8Array {
    this.debug.log(
      `BranchNode encode: children=[${this.children
        .map((child, i) => (child ? `${i}: ${child.hash()}` : ''))
        .join(', ')}], value=${this.value ? this.value : 'null'}`
    )
    const encodedNode = RLP.encode([
      ...this.children.map((child) => (child ? child.encode() : Uint8Array.from([]))),
      this.value ?? Uint8Array.from([]),
    ])
    this.debug.log(`BranchNode encoded: ${encodedNode}`)
    return encodedNode
  }

  decode(encodedNode: Uint8Array): Node {
    this.debug.log(`BranchNode decode: encodedNode=${encodedNode}`)
    const decodedChildren = RLP.decode(encodedNode).slice(0, 16) as Uint8Array[]
    const children = decodedChildren.map((child) =>
      child.length > 0 ? LeafNode.prototype.decode(child) : null
    )
    const value = decodedChildren[16].length > 0 ? decodedChildren[16] : null
    this.debug.log(
      `BranchNode decoded: children=[${children
        .map((child, i) => (child ? `${i}: ${child.hash()}` : ''))
        .join(', ')}], value=${value ? value : 'null'}`
    )
    return new BranchNode(children, value)
  }

  hash(): Uint8Array {
    const encodedNode = this.encode()
    const hashed = keccak256(encodedNode)
    this.debug.log(`BranchNode hash: ${hashed}`)
    return hashed
  }
  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    this.debug.log(`BranchNode get: rawKey=${rawKey}`)
    if (rawKey.length === 0) {
      this.debug.log(`BranchNode get result: ${this.value ? this.value : 'null'}`)
      return this.value
    }
    const index = rawKey[0]
    const child = this.children[index]
    if (child) {
      const result = await child.get(rawKey.slice(1))
      this.debug.log(`BranchNode get result: ${result ? result : 'null'}`)
      return result
    }
    this.debug.log(`BranchNode get result: null`)
    return null
  }
}

export class ExtensionNode extends Node {
  key: Uint8Array
  child: Node

  constructor(key: Uint8Array, child: Node) {
    super()
    this.key = key
    this.child = child
    this.debug.log(`ExtensionNode created: key=${key}, child=${child.hash()}`)
  }

  encode(): Uint8Array {
    this.debug.log(`ExtensionNode encode: key=${this.key}, child=${this.child.hash()}`)
    const encodedNode = RLP.encode([this.key, this.child.encode()])
    this.debug.log(`ExtensionNode encoded: ${encodedNode}`)
    return encodedNode
  }

  decode(encodedNode: Uint8Array): Node {
    this.debug.log(`ExtensionNode decode: encodedNode=${encodedNode}`)
    const [key, childEncoded] = RLP.decode(encodedNode) as [Uint8Array, Uint8Array]
    const child = LeafNode.prototype.decode(childEncoded)
    this.debug.log(`ExtensionNode decoded: key=${key}, child=${child.hash()}`)
    return new ExtensionNode(key, child)
  }

  hash(): Uint8Array {
    const encodedNode = this.encode()
    const hashed = keccak256(encodedNode)
    this.debug.log(`ExtensionNode hash: ${hashed}`)
    return hashed
  }

  async get(rawKey: Uint8Array): Promise<Uint8Array | null> {
    this.debug.log(`ExtensionNode get: rawKey=${rawKey}`)
    if (equalsBytes(rawKey.slice(0, this.key.length), this.key)) {
      const result = await this.child.get(rawKey.slice(this.key.length))
      this.debug.log(`ExtensionNode get result: ${result ? result : 'null'}`)
      return result
    }
    this.debug.log(`ExtensionNode get result: null`)
    return null
  }
}
