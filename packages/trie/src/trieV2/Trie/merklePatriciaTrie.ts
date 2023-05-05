import { equalsBytes } from 'ethereum-cryptography/utils'

import { LeafNode, decodeNibbles, encodeNibbles, nibblesEqual } from '..'

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
  async _insertNode(_node: TNode): Promise<TNode> {
    return {} as TNode
  }
  async _lookupNode(_key: Uint8Array): Promise<TNode | null> {
    return null
  }
  async _getNode(_node: TNode, _key: Uint8Array): Promise<TNode | null> {
    return null
  }
  _hashToKey(_hash: Uint8Array): Uint8Array {
    return new Uint8Array()
  }
  async _update(keyNibbles: Nibble[], value: Uint8Array | null): Promise<Uint8Array> {
    let currentNode: TNode | null = await this._lookupNode(this.root)
    const nodesToUpdate: TNode[] = []
    const nodesToDelete: TNode[] = []
    const stack: TNode[] = []

    // Traverse the tree until we hit a null node or a leaf node with matching key
    while (currentNode) {
      switch (currentNode.type) {
        case 'LeafNode':
          if (nibblesEqual(currentNode.keyNibbles, keyNibbles)) {
            // We found a leaf node with matching key, delete it and remove all deleted nodes from cache
            nodesToDelete.push(currentNode)
            this.cache.delete(currentNode.hash())
          } else {
            // Leaf node with non-matching key, update the node
            const newNode = new LeafNode({
              key: keyNibbles,
              value,
            })
            nodesToUpdate.push(newNode)
          }
          break
        case 'BranchNode':
          stack.push(currentNode)
          if ((await currentNode.getChildren()).has(keyNibbles[currentNode.keyNibbles.length])) {
            const childNode = await this._getNode(
              currentNode.children[keyNibbles[currentNode.keyNibbles.length]],
              encodeNibbles(keyNibbles)
            )
            currentNode = childNode
          } else {
            currentNode = null
          }
          break
        case 'ExtensionNode':
          stack.push(currentNode)
          if (
            keyNibbles.length >= currentNode.keyNibbles.length &&
            nibblesEqual(
              currentNode.keyNibbles,
              [...keyNibbles.values()].slice(0, currentNode.keyNibbles.length)
            )
          ) {
            const childNode = await this._getNode(currentNode.child, encodeNibbles(keyNibbles))
            currentNode = childNode
          } else {
            currentNode = null
          }
          break
        default:
          throw new Error(`Unexpected node type: ${(currentNode as TNode).type}`)
      }
    }

    // If the stack is empty, then we know the root node needs to be updated
    if (stack.length === 0) {
      const newRoot = await this._insertNode(new LeafNode({ key: [], value: null }))
      stack.push(newRoot)
    }

    // Update the nodes in the stack, and collect all nodes that have been updated or deleted
    while (stack.length > 0) {
      const node = stack.pop() as TNode
      if (node.type === 'BranchNode' || node.type === 'ExtensionNode') {
        nodesToUpdate.push(node)
      }
      if (nodesToDelete.includes(node)) {
        await this._deleteNode(node)
      } else {
        await this._insertNode(node)
      }
    }

    // Delete all nodes that have been marked for deletion
    for (const node of nodesToDelete) {
      await this._deleteNode(node)
    }

    // Update all nodes that have been marked for update
    for (const node of nodesToUpdate) {
      await this._insertNode(node)
    }

    return stack[0].hash()
  }

  async _withLock<T>(operation: () => Promise<T>): Promise<T> {
    return operation()
  }
}
