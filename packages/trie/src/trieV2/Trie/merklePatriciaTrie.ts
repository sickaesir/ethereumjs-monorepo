import { _MerklePatriciaTrie } from './abstractTrie'

import type { Nibble, OnFoundFunction, TNode, WalkFilterFunction } from '../types'
import type { CreateTrieOptions } from './abstractTrie'

export class MerklePatriciaTrie extends _MerklePatriciaTrie {
  constructor(options: CreateTrieOptions) {
    super(options)
  }
  async get(key: Uint8Array): Promise<Uint8Array | null> {
    let currentNode: TNode | null = await this._lookupNode(this.root)
    let foundValue: Uint8Array | null = null
    // Traverse the tree until we hit a null node or a leaf node with matching key
    while (currentNode && !foundValue) {
      switch (currentNode.type) {
        case 'LeafNode':
          if (equalsBytes(currentNode.key, key)) {
            foundValue = currentNode.value
          }
          break
        case 'BranchNode':
          if ((await currentNode.getChildren()).has(key[currentNode.keyNibbles.length])) {
            const childNode = await this._getNode(
              currentNode.children[key[currentNode.keyNibbles.length]],
              key
            )
            currentNode = childNode
          } else {
            currentNode = null
          }
          break
        case 'ExtensionNode':
          if (
            key.byteLength >= currentNode.keyNibbles.length &&
            nibblesEqual(
              currentNode.keyNibbles,
              [...key.values()].slice(0, currentNode.keyNibbles.length)
            )
          ) {
            const childNode = await this._getNode(currentNode.child, key)
            currentNode = childNode
          } else {
            currentNode = null
          }
          break
        default:
          throw new Error(`Unexpected node type: ${(currentNode as TNode).type}`)
      }
    }

    return foundValue
  }

  async put(key: Uint8Array, value: Uint8Array | null): Promise<void> {
    this.root = await this._update([...key.values()], value)
  }
  async del(key: Uint8Array): Promise<void> {
    // Find the value for the given key
    const currentValue = await this.get(key)
    if (currentValue === null) {
      return
    }

    // Update the trie with null value to delete the key
    await this._update(decodeNibbles(key), null)

    // Garbage collect the unreachable nodes
    await this.garbageCollect()
  }
  async update(key: Uint8Array, value: Uint8Array | null): Promise<void> {
    this.root = await this._update([...key.values()], value)
  }
  async *walkTrie(
    _startNode: TNode | null,
    _currentKey?: Uint8Array | undefined,
    _onFound?: OnFoundFunction | undefined,
    _filter?: WalkFilterFunction | undefined
  ): AsyncIterable<TNode> {
    yield {} as TNode
  }
  async findPath(_keyNibbles: Nibble[]): Promise<{ stack: TNode[]; remainingNibbles: Nibble[] }> {
    return {} as Promise<{ stack: TNode[]; remainingNibbles: Nibble[] }>
  }

  async checkpoint(): Promise<void> {}
  async commit(): Promise<void> {}
  async revert(): Promise<void> {}
  async revertTo(_checkpoint: Uint8Array): Promise<void> {}
  async copy(): Promise<_MerklePatriciaTrie> {
    return {} as _MerklePatriciaTrie
  }

  async createProof(_key: Uint8Array): Promise<Uint8Array[]> {
    return []
  }
  async createMultiProof(_keys: Uint8Array[]): Promise<Uint8Array[]> {
    return []
  }
  async update(_key: Uint8Array, _value: Uint8Array | null): Promise<void> {}
  async updateFromProof(_proof: Uint8Array[]): Promise<void> {}
  async updateFromMultiProof(_proof: Uint8Array[]): Promise<void> {}

  async garbageCollect(): Promise<void> {}
  async _markReachableNodes(
    _node: TNode | null,
    _reachableHashes: Set<Uint8Array>
  ): Promise<void> {}
  async _collectReachableNodes(_node: TNode, _visitedNodes: Set<TNode>): Promise<void> {}

  async _storeNode(_node: TNode): Promise<void> {}
  async _deleteNode(_node: TNode): Promise<void> {}
  async _insertNode(_node: TNode): Promise<void> {}
  async _lookupNode(_key: Uint8Array): Promise<TNode | null> {
    return null
  }
  async _getNode(_node: TNode, _key: Uint8Array): Promise<TNode | null> {
    return null
  }
  _hashToKey(_hash: Uint8Array): Uint8Array {
    return new Uint8Array()
  }
  async _update(_keyNibbles: number[], _value: Uint8Array | null): Promise<Uint8Array> {
    return new Uint8Array()
  }
  async _withLock<T>(operation: () => Promise<T>): Promise<T> {
    return operation()
  }
}
