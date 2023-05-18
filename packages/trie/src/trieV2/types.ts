import type { BranchNode, ExtensionNode, LeafNode, NullNode, ProofNode } from './Node'
import type { AbstractLevel } from 'abstract-level'
import type { Debugger } from 'debug'
import type { LRUCache } from 'lru-cache'

export const nodeType = {
  NullNode: 'NullNode',
  ProofNode: 'ProofNode',
  LeafNode: 'LeafNode',
  BranchNode: 'BranchNode',
  ExtensionNode: 'ExtensionNode',
} as const
export type NodeType = keyof typeof nodeType
export interface NodeOptions {
  hashFunction?: HashFunction
  value?: Uint8Array | null
}
export type TNodeOptions<T extends NodeType> = T extends 'LeafNode'
  ? { key: Nibble[]; value: Uint8Array | null } & NodeOptions
  : T extends 'BranchNode'
  ? {
      children: (TNode | undefined)[]
      value: Uint8Array | null
    } & NodeOptions
  : T extends 'ExtensionNode'
  ? { keyNibbles: Nibble[]; subNode: TNode } & NodeOptions
  : T extends 'ProofNode'
  ? { hash: Uint8Array }
  : never

export type TOpts =
  | TNodeOptions<'BranchNode'>
  | TNodeOptions<'ExtensionNode'>
  | TNodeOptions<'LeafNode'>
  | TNodeOptions<'ProofNode'>

export type NodeFromOptions<T extends TNodeOptions<NodeType>> = T extends TNodeOptions<'LeafNode'>
  ? LeafNode
  : T extends TNodeOptions<'BranchNode'>
  ? BranchNode
  : T extends TNodeOptions<'ExtensionNode'>
  ? ExtensionNode
  : T extends TNodeOptions<'ProofNode'>
  ? ProofNode
  : never

export interface NodeInterface<T extends NodeType> {
  type: T | undefined
  debug: Debugger | undefined
  hashFunction: HashFunction
  keyNibbles: Nibble[]
  getPartialKey(): Nibble[]
  raw(): any
  rlpEncode(): Uint8Array
  hash(): Uint8Array
  get(rawKey: Uint8Array): Promise<Uint8Array | null>
  getChildren(): Map<number, TNode>
  getChild(key?: number): TNode | undefined
  deleteChild(nibble: Nibble): Promise<TNode>
  updateChild(newChild: TNode, nibble?: Nibble): TNode
  updateValue(newValue: Uint8Array | null): Promise<TNode>
  updateKey(key: Nibble[]): Promise<TNode>
  getValue(): Uint8Array | null
  getType(): NodeType
  update(value: Uint8Array | null): Promise<Exclude<TNode, NullNode>>
  delete(rawKey?: Uint8Array): Promise<TNode>
}

export interface Ileaf extends NodeInterface<'LeafNode'> {
  // key: Uint8Array
  value: Uint8Array | null
}
export interface Ibranch extends NodeInterface<'BranchNode'> {
  children: (TNode | undefined)[]
  value: Uint8Array | null
}
export interface Iextension extends NodeInterface<'ExtensionNode'> {
  child: TNode
}

export interface Iproofnode extends NodeInterface<'ProofNode'> {}

export type TNode = Ileaf | Ibranch | Iextension | NullNode | Iproofnode

export type TCreated<T> = T extends NodeInterface<infer R> ? NodeInterface<R> : never

type decodeFunc = (encoded: Uint8Array) => TNode
export type DecodedNode = TCreated<ReturnType<decodeFunc>>

export const trieType = {
  SPARSE: 'Sparse',
  FULL: 'Full',
} as const
export type TrieType = keyof typeof trieType
export interface Itrie<TTrie extends TrieType> {
  type: TTrie
}
export type HashFunction = (data: Uint8Array) => Uint8Array
export type TrieOpts = {
  root?: Uint8Array
  _root?: TNode
  _db?: AbstractLevel<Uint8Array, Uint8Array>
  _hashFunction?: HashFunction
  _checkpoints?: Uint8Array[]
  cache?: LRUCache<string, TNode>
}

export type WalkFilterFunction = (TrieNode: TNode, key: Uint8Array) => Promise<boolean>
export type OnFoundFunction = (TrieNode: TNode, key: Uint8Array) => Promise<void>
export type Nibble = number
