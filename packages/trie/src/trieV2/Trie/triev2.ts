import { Mutex } from 'async-mutex'
import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { LRUCache } from 'lru-cache'

import type { HashFunction, Node } from '../Node'
import type { Debugger } from 'debug'

export type Nibble = number
export interface WalkOptions {}

export interface TrieInterface {
  _operationLock: Mutex
  _hashFunction: HashFunction
  readonly _checkpoints: Uint8Array[]
  cache: LRUCache<string, Node>
  _root: Node | null
  root: Uint8Array
  get(key: Uint8Array): Promise<Uint8Array | null>
  put(key: Uint8Array, value: Uint8Array): Promise<void>
  del(key: Uint8Array): Promise<void>
  commit(): Promise<Uint8Array>
  revert(root: Uint8Array): Promise<void>
  createProof(key: Uint8Array): Promise<{ value: Uint8Array; proof: Uint8Array[] }>
  _createProof(node: Node | null, key: Uint8Array, proof: Uint8Array[]): Promise<void>
  createMultiproof(keys: Uint8Array[]): Promise<{ values: Uint8Array[]; proof: Uint8Array[] }>
  verifyProof(
    rootHash: Uint8Array,
    key: Uint8Array,
    proof: Uint8Array[]
  ): Promise<Uint8Array | null>
  verifyMultiproof(
    rootHash: Uint8Array,
    keys: Uint8Array[],
    proof: Uint8Array[]
  ): Promise<Uint8Array[]>
  fromProof(proof: Uint8Array[]): Promise<TrieInterface>
  fromMultiProof(proof: Uint8Array[]): Promise<TrieInterface>
  updateWithProof(proof: Uint8Array[]): Promise<void>
  updateWithMultiproof(multiproof: Uint8Array[]): Promise<void>
  walkTrie(onFound: (node: Node, key: Uint8Array) => void, options?: WalkOptions): Promise<void>
  findPath(key: Uint8Array): Promise<{ stack: Node[]; remainingNibbles: Nibble[] }>
  withLock<T>(operation: () => Promise<T>): Promise<T>
  garbageCollect(): Promise<void>
  _markReachableNodes(node: Node | null, reachableHashes: Set<string>): Promise<void>
}

export type TrieOpts = {
  _root?: Node
  root?: Uint8Array
  cache?: LRUCache<string, Node>
  _checkpoints?: Uint8Array[]
  _hashFunction?: HashFunction
}

export class Trie implements TrieInterface {
  _root: Node | null
  root: Uint8Array
  private readonly _hashFunction: HashFunction
  private readonly _checkpoints: Uint8Array[]
  private readonly _operationLock: any
  private readonly cache: LRUCache<string, Node>
  private readonly debug: Debugger

  constructor(opts: TrieOpts = {}) {
    this._root = opts._root ?? null
    this.root = opts.root ?? Uint8Array.from([0x80])
    this._checkpoints = []
    this._operationLock = new Mutex()
    this._hashFunction = opts._hashFunction ?? keccak256
    this.cache = new LRUCache({ max: 1000 })
    this.debug = debug('TRIE')
  }
}
