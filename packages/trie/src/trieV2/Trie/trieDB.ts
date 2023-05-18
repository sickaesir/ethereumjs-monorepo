import { bytesToPrefixedHexString, hexStringToBytes } from '@ethereumjs/util'
import { equalsBytes } from 'ethereum-cryptography/utils'
import { LRUCache } from 'lru-cache'

import { TrieNode } from '../Node'

import { Database } from './db'
import { MerklePatriciaTrie } from './mptrie'
import { _getNode } from './operations/getNode'

import type { TNode } from '../types'
import type { MerklePatriciaTrieOptions } from './mptrie'

function shortHash(key: Uint8Array) {
  return bytesToPrefixedHexString(key).slice(0, 18)
}

type PathToNode = {
  path: TNode[]
  remainingNibbles: number[]
}

export interface TrieDBOptions extends MerklePatriciaTrieOptions {
  db?: Database
  cache?: LRUCache<Uint8Array, TNode>
  checkpoints?: string[]
  maxCheckpoints?: number
}

export class TrieDB extends MerklePatriciaTrie {
  db: Database
  checkpoints: string[]
  maxCheckpoints: number
  cache: LRUCache<Uint8Array, TNode>
  constructor(options: TrieDBOptions = {}) {
    super(options)
    this.db = options.db ?? new Database({ debug: this.debug })
    this.cache = options.cache ?? new LRUCache({ max: 1000 })
    this.checkpoints = options.checkpoints ?? []
    this.maxCheckpoints = options.maxCheckpoints ?? 1000
    this.on('nodeAdded', (node: TNode) => this._storeNode(node))
  }
  async _findPath(key: Uint8Array): Promise<PathToNode> {
    const { path, remainingNibbles } = await _getNode(this.root, key, this.debug)
    return { path, remainingNibbles }
  }
  async _lookupNodeByHash(hash: Uint8Array): Promise<TNode | null> {
    this.debug.extend('_lookupNode')(`key: ${shortHash(hash)}`)
    // First, attempt to get it from the cache.
    let node = this.cache.get(hash)
    if (node) {
      this.debug.extend('_lookupNode')(`node found in cache`)
      return node
    } else {
      // If the node is not in the cache, look it up in the database.
      const data = await this.db.get(hash)
      if (data) {
        this.debug.extend('_lookupNode')(`node found in db`)
        node = await TrieNode.decodeToNode(data)
        // Cache the retrieved node for future lookups.
        this.cache.set(hash, node)
      }
      this.debug.extend('_lookupNode')(`node ${node ? 'found' : 'not found'}`)
      return node ?? null
    }
  }
  async _storeNode(node: TNode): Promise<void> {
    // Serialize the node
    const serializedNode = node.rlpEncode()

    // Calculate the hash of the serialized node to be used as the key
    const nodeHash = node.hash()

    // Store the serialized node in the database
    await this.db.put(nodeHash, serializedNode)

    // Add or update the node in the cache
    this.cache.set(nodeHash, node)

    this.debug.extend(`_storeNode`)(
      `key: ${bytesToPrefixedHexString(nodeHash).slice(0, 18)}..., value: (${
        serializedNode.length
      } bytes)`
    )
  }
  async checkpoint(): Promise<void> {
    this.checkpoints.push(bytesToPrefixedHexString(this.root.hash()))
    await this._pruneCheckpoints()
  }
  async commit(): Promise<void> {
    if (this.checkpoints.length > 0) {
      this.checkpoints.pop()
    }
    await this.garbageCollect()
  }
  async revert(): Promise<void> {
    if (this.checkpoints.length > 0) {
      const newRoot = await this._lookupNodeByHash(hexStringToBytes(this.checkpoints.pop()!))
      if (!newRoot) {
        throw new Error('newRoot is undefined')
      }
      this.root = newRoot
    }
  }
  async revertTo(checkpoint: Uint8Array): Promise<void> {
    const index = this.checkpoints.findIndex((cp) => equalsBytes(hexStringToBytes(cp), checkpoint))
    if (index !== -1) {
      const newRoot = await this._lookupNodeByHash(checkpoint)
      if (!newRoot) {
        throw new Error('newRoot is undefined')
      }
      this.checkpoints.length = index
    }
  }
  async garbageCollect(): Promise<void> {
    const reachableHashes = await this._markReachableNodes(this.root)
    for (const hash of this.cache.keys()) {
      if (!reachableHashes.has(hash)) {
        this.cache.delete(hash)
      }
    }
    for (const hash of await this.db.keys()) {
      if (!reachableHashes.has(hash)) {
        await this.db.del(hash)
      }
    }
  }
  async _markReachableNodes(
    node: TNode | null,
    reachableHashes: Set<Uint8Array> = new Set()
  ): Promise<Set<Uint8Array>> {
    if (node === null) {
      return reachableHashes
    }
    reachableHashes.add(node.hash())
    if (node.type === 'BranchNode') {
      for await (const [, childNode] of node.getChildren()) {
        await this._markReachableNodes(childNode, reachableHashes)
      }
    } else if (node.type === 'ExtensionNode') {
      await this._markReachableNodes(node.child, reachableHashes)
    }
    return reachableHashes
  }
  async _pruneCheckpoints(): Promise<void> {
    while (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints.shift()
    }
    await this.garbageCollect()
  }
}
