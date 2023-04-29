import type { LRUCache } from 'lru-cache'

export type Nibble = number
export interface WalkOptions {}

export interface TrieInterface {
  _operationLock: any
  cache: LRUCache<string, Node>
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
