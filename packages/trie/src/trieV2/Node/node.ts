import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'

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
  abstract update(rawKey: Uint8Array, rawValue: Uint8Array): Node
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
    return new Uint8Array()
  }
  decode(_encodedNode: Uint8Array): Node {
    return new LeafNode(new Uint8Array(), new Uint8Array())
  }
  hash(): Uint8Array {
    return this.hashFunction(new Uint8Array())
  }
  async get(_rawKey: Uint8Array): Promise<Uint8Array | null> {
    return new Uint8Array()
  }
  update(_rawKey: Uint8Array, _rawValue: Uint8Array): Node {
    return new LeafNode(new Uint8Array(), new Uint8Array())
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
    return new Uint8Array()
  }
  decode(_encodedNode: Uint8Array): Node {
    return new BranchNode([], new Uint8Array())
  }
  hash(): Uint8Array {
    return this.hashFunction(new Uint8Array())
  }
  async get(_rawKey: Uint8Array): Promise<Uint8Array | null> {
    return new Uint8Array()
  }
  update(_rawKey: Uint8Array, _rawValue: Uint8Array): Node {
    return new BranchNode([], new Uint8Array())
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
    return new Uint8Array()
  }
  decode(_encodedNode: Uint8Array): Node {
    return new ExtensionNode(new Uint8Array(), new LeafNode(new Uint8Array(), new Uint8Array()))
  }
  hash(): Uint8Array {
    return this.hashFunction(new Uint8Array())
  }
  async get(_rawKey: Uint8Array): Promise<Uint8Array | null> {
    return new Uint8Array()
  }
  update(_rawKey: Uint8Array, _rawValue: Uint8Array): Node {
    return new ExtensionNode(new Uint8Array(), new LeafNode(new Uint8Array(), new Uint8Array()))
  }
}
