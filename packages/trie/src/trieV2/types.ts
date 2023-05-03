import type { AbstractLevel } from 'abstract-level'
import type { Debugger } from 'debug'
import type { LRUCache } from 'lru-cache'

export const nodeType = {
  LeafNode: 'LeafNode',
  BranchNode: 'BranchNode',
  ExtensionNode: 'ExtensionNode',
} as const
export type NodeType = keyof typeof nodeType
export interface NodeOptions {
  hashFunction?: HashFunction
}
export type TNodeOptions<T extends NodeType> = T extends 'LeafNode'
  ? { key: Uint8Array; value: Uint8Array | null } & NodeOptions
  : T extends 'BranchNode'
  ? {
      children: (TNode | null)[]
      value: Uint8Array | null
    } & NodeOptions
  : T extends 'ExtensionNode'
  ? { keyNibbles: Nibble[]; subNode: TNode } & NodeOptions
  : never

export type TOpts =
  | TNodeOptions<'BranchNode'>
  | TNodeOptions<'ExtensionNode'>
  | TNodeOptions<'LeafNode'>

export interface NodeInterface<T extends NodeType> {
  type: T | undefined
  debug: Debugger
  hashFunction: HashFunction
  keyNibbles: Nibble[]
  getPartialKey(): Nibble[]
  encode(): Uint8Array
  hash(): Uint8Array
  get(rawKey: Uint8Array): Promise<Uint8Array | null>
  getChildren(): Promise<Map<number, TNode>>
  update(rawKey: Uint8Array, value: Uint8Array): Promise<TNode>
}

export interface Ileaf extends NodeInterface<'LeafNode'> {
  key: Uint8Array
  value: Uint8Array | null
}
export interface Ibranch extends NodeInterface<'BranchNode'> {
  children: (TNode | null)[]
  value: Uint8Array | null
}
export interface Iextension extends NodeInterface<'ExtensionNode'> {
  key: Uint8Array
  child: TNode
}

export type TNode = Ileaf | Ibranch | Iextension

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

export type WalkFilterFunction = (TrieNode: TNode, key: Uint8Array) => boolean
export type OnFoundFunction = (TrieNode: TNode, key: Uint8Array) => void
export type Nibble = number
