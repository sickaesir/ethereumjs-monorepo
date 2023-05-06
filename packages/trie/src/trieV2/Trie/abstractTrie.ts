import { equalsBytes } from '@ethereumjs/util'
import { Mutex } from 'async-mutex'
import debug from 'debug'
import { LRUCache } from 'lru-cache'

import { ProofNode, TrieNode } from '../Node'

import { Database } from './db'

import type { Nibble, OnFoundFunction, TNode, WalkFilterFunction } from '../types'
import type { TrieInterface } from './trieInterface'
import type { Debugger } from 'debug'

export interface CreateTrieOptions {
  /** The root hash of the trie */
  root?: Uint8Array
  /** A map of all nodes in the trie */
  nodes?: Map<Uint8Array, TNode>
  /** The database used to store trie nodes */
  db?: Database
  /** An array of all checkpoint hashes in the trie */
  checkpoints?: Uint8Array[]
  /** A debugger for logging debug messages */
  debug?: Debugger
  /** A cache for storing recently accessed nodes */
  cache?: LRUCache<Uint8Array, TNode>
}
export abstract class _MerklePatriciaTrie implements TrieInterface {
  root: Uint8Array
  nodes: Map<Uint8Array, TNode>
  db: Database
  checkpoints: Uint8Array[]
  debug: Debugger
  _operationMutex: Mutex
  cache: LRUCache<Uint8Array, TNode>
  /**
   * Creates a new MerklePatriciaTrie
   * @param options - the options to use when creating the trie
   * @returns the created trie
   */
  static async create(_options: CreateTrieOptions): Promise<_MerklePatriciaTrie> {
    const trie = await _MerklePatriciaTrie.create(_options)
    return trie
  }
  /**
   * Creates a new MerklePatriciaTrie from the given proof
   * @param root - the root hash of the trie
   * @param proof - array of proof hashes
   * @param value - the serialized node to verify
   * @returns the created trie
   */

  static async fromProof(
    root: Uint8Array,
    proof: Uint8Array[],
    value: Uint8Array
  ): Promise<_MerklePatriciaTrie> {
    const trie = await _MerklePatriciaTrie.create({})
    for (const hash of proof) {
      await trie._insertNode(new ProofNode(hash))
    }
    const node = await TrieNode.decodeToNode(value)
    await trie._insertNode(node)
    const isValid = equalsBytes(trie.root, root)
    if (!isValid) {
      throw new Error('Invalid proof')
    }
    return trie
  }
  /**
   * Verifies the given proof against the given root hash
   * @param root - the root hash of the trie
   * @param proof - array of proof hashes
   * @param key - the key to verify
   * @param value - the serialized node to verify
   * @returns `true` if the proof is valid, `false` otherwise
   */
  static async verifyProof(
    root: Uint8Array,
    proof: Uint8Array[],
    value: Uint8Array
  ): Promise<boolean> {
    const node = await TrieNode.decodeToNode(value)
    const trie = await _MerklePatriciaTrie.fromProof(root, proof, value)
    if (!equalsBytes(trie.root, root)) {
      return false
    }
    const stored = await trie._lookupNode(node.hash())
    if (stored === null) {
      return false
    }
    if (!equalsBytes(stored.rlpEncode(), value)) {
      return false
    }
    return true
  }
  // /**
  //  * Creates a new MerklePatriciaTrie from the given multi-proof
  //  * @param proof - the multi-proof to create the trie from
  //  * @returns the created trie
  //  */

  // static async fromMultiProof(
  //   root: Uint8Array,
  //   multiProof: Uint8Array[],
  //   keys: Uint8Array[],
  //   values: Uint8Array[]
  // ): Promise<_MerklePatriciaTrie> {
  //   const trie = await _MerklePatriciaTrie.create({ root })
  //   const isValid = await _MerklePatriciaTrie.verifyMultiProof(root, multiProof, keys, values)
  //   if (!isValid) {
  //     throw new Error('Invalid multi-proof')
  //   }

  //   for (let i = 0; i < keys.length; i++) {
  //     await trie.put(keys[i], values[i])
  //   }

  //   return trie
  // }

  // /**
  //  * Verifies the given multi-proof against the given root hash
  //  * @param root - the root hash of the trie
  //  * @param proof - the multi-proof to verify
  //  * @returns `true` if the multi-proof is valid, `false` otherwise
  //  */
  // static async verifyMultiProof(_root: Uint8Array, _proof: Uint8Array[]): Promise<boolean> {
  //   return true
  // }
  constructor(options: CreateTrieOptions) {
    // super(options)
    this.root = options.root ?? new Uint8Array()
    this.nodes = options.nodes ?? new Map()
    this.db = options.db ?? new Database(this.constructor.name)
    this.checkpoints = options.checkpoints ?? []
    this.debug = options.debug
      ? options.debug.extend(this.constructor.name)
      : debug(this.constructor.name)
    this._operationMutex = new Mutex()
    this.cache = options.cache ?? new LRUCache({ max: 1000 })
  }
  abstract get(key: Uint8Array): Promise<Uint8Array | null>
  abstract put(key: Uint8Array, value: Uint8Array): Promise<void>
  abstract del(key: Uint8Array): Promise<void>

  abstract walkTrie(
    startNode: TNode | null,
    currentKey?: Uint8Array | undefined,
    onFound?: OnFoundFunction | undefined,
    filter?: WalkFilterFunction | undefined
  ): AsyncIterable<TNode>
  abstract findPath(keyNibbles: Nibble[]): Promise<{ stack: TNode[]; remainingNibbles: Nibble[] }>

  abstract checkpoint(): Promise<void>
  abstract commit(): Promise<void>
  abstract revert(): Promise<void>
  abstract revertTo(checkpoint: Uint8Array): Promise<void>
  abstract copy(): Promise<_MerklePatriciaTrie>

  abstract createProof(key: Uint8Array): Promise<Uint8Array[]>
  abstract createMultiProof(keys: Uint8Array[]): Promise<Uint8Array[]>
  abstract update(key: Uint8Array, value: Uint8Array | null): Promise<void>
  abstract updateFromProof(proof: Uint8Array[], node: Uint8Array): Promise<void>
  abstract updateFromMultiProof(proof: Uint8Array[]): Promise<void>

  abstract garbageCollect(): Promise<void>
  abstract _markReachableNodes(node: TNode | null, reachableHashes: Set<Uint8Array>): Promise<void>
  abstract _collectReachableNodes(node: TNode, visitedNodes: Set<TNode>): Promise<void>

  abstract _storeNode(node: TNode): Promise<void>
  abstract _deleteNode(node: TNode): Promise<void>
  abstract _insertNode(node: TNode): Promise<TNode>
  abstract _lookupNode(key: Uint8Array): Promise<TNode | null>
  abstract _getNode(node: TNode, key: Uint8Array): Promise<TNode | null>
  abstract _hashToKey(hash: Uint8Array): Uint8Array
  abstract _update(keyNibbles: number[], value: Uint8Array | null): Promise<Uint8Array>
  abstract _withLock<T>(operation: () => Promise<T>): Promise<T>
}
