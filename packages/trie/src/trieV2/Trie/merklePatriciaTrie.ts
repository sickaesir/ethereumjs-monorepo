import { bytesToHex, equalsBytes } from 'ethereum-cryptography/utils'

import {
  LeafNode,
  NullNode,
  ProofNode,
  TrieNode,
  decodeNibbles,
  encodeNibbles,
  matchingNibbleLength,
  nibblesEqual,
} from '..'

import { _MerklePatriciaTrie } from './abstractTrie'

import type { BranchNode, ExtensionNode } from '..'
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
  async findPath(keyNibbles: Nibble[]): Promise<{ stack: TNode[]; remainingNibbles: Nibble[] }> {
    const stack: TNode[] = []
    let currentNode: TNode | null = await this._lookupNode(this.root)
    let foundExtensionNode: TNode | null = null

    while (currentNode) {
      stack.push(currentNode)
      switch (currentNode.type) {
        case 'LeafNode':
          if (nibblesEqual(currentNode.keyNibbles, keyNibbles)) {
            return { stack, remainingNibbles: [] }
          } else {
            return { stack: [], remainingNibbles: keyNibbles }
          }
        case 'BranchNode':
          if (currentNode.children[keyNibbles[currentNode.keyNibbles.length]].type === 'NullNode') {
            return { stack, remainingNibbles: keyNibbles }
          } else {
            currentNode = await this._getNode(
              currentNode.children[keyNibbles[currentNode.keyNibbles.length]],
              encodeNibbles(keyNibbles)
            )
          }
          break
        case 'ExtensionNode':
          foundExtensionNode = currentNode
          if (
            keyNibbles.length >= currentNode.keyNibbles.length &&
            nibblesEqual(
              currentNode.keyNibbles,
              [...keyNibbles.values()].slice(0, currentNode.keyNibbles.length)
            )
          ) {
            currentNode = await this._getNode(currentNode.child, encodeNibbles(keyNibbles))
          } else {
            currentNode = null
          }
          break
        default:
          throw new Error(`Unexpected node type: ${(currentNode as TNode).type}`)
      }
    }

    if (foundExtensionNode) {
      const remainingNibbles = keyNibbles.slice(foundExtensionNode.keyNibbles.length)
      return { stack, remainingNibbles }
    } else {
      return { stack: [], remainingNibbles: keyNibbles }
    }
  }

  async checkpoint(): Promise<void> {
    const root = await this._lookupNode(this.root)
    if (root !== null) {
      this.checkpoints.push(root.hash())
    }
  }

  async commit(): Promise<void> {
    this.checkpoints = []
  }

  async revert(): Promise<void> {
    if (this.checkpoints.length === 0) {
      throw new Error('No checkpoint to revert to')
    }

    const checkpointHash = this.checkpoints.pop() as Uint8Array
    const checkpointNode = await this._lookupNode(checkpointHash)
    if (!checkpointNode) {
      throw new Error(`Checkpoint not found: ${bytesToHex(checkpointHash)}`)
    }

    this.root = checkpointHash
    this.cache.clear()
  }

  async revertTo(checkpoint: Uint8Array): Promise<void> {
    const checkpointNode = await this._lookupNode(checkpoint)
    if (!checkpointNode) {
      throw new Error(`Checkpoint not found: ${bytesToHex(checkpoint)}`)
    }

    const checkpointIndex = this.checkpoints.findIndex((c) => equalsBytes(c, checkpoint))
    if (checkpointIndex === -1) {
      throw new Error(`Checkpoint not found: ${bytesToHex(checkpoint)}`)
    }

    this.checkpoints = this.checkpoints.slice(0, checkpointIndex + 1)
    this.root = checkpoint
    this.cache.clear()
  }

  async copy(): Promise<_MerklePatriciaTrie> {
    return {} as _MerklePatriciaTrie
  }

  async createProof(key: Uint8Array): Promise<Uint8Array[]> {
    const proofStack: { node: Uint8Array; nodeRef: Uint8Array }[] = []
    const root = (await this._lookupNode(this.root)) ?? new NullNode()
    await this._createProof(root, key, proofStack)
    const proof = proofStack.map((item) => item.nodeRef)
    return proof
  }

  async _createProof(
    node: TNode,
    key: Uint8Array,
    stack: { node: Uint8Array; nodeRef: Uint8Array }[]
  ): Promise<void> {
    if (node === null) {
      throw new Error(`Key not found: ${bytesToHex(key)}`)
    }
    const keyNibbles = decodeNibbles(key)
    const nodeType = node.type

    if (nodeType === 'LeafNode') {
      const leafNode = node as LeafNode
      if (nibblesEqual(leafNode.keyNibbles, keyNibbles)) {
        stack.push({ node: leafNode.rlpEncode(), nodeRef: leafNode.hash() })
      }
      return
    }

    if (nodeType === 'ExtensionNode') {
      const extNode = node as ExtensionNode
      const sharedNibblesLength = matchingNibbleLength(extNode.keyNibbles, keyNibbles)
      if (sharedNibblesLength !== extNode.keyNibbles.length) {
        // The provided key does not share the full extension node key
        return
      }
      stack.push({ node: extNode.rlpEncode(), nodeRef: extNode.hash() })
      const nextNode = (await this._lookupNode(extNode.child.hash())) ?? new NullNode()
      return this._createProof(nextNode, key.slice(sharedNibblesLength), stack)
    }

    if (nodeType === 'BranchNode') {
      const branchNode = node as BranchNode
      stack.push({ node: branchNode.rlpEncode(), nodeRef: branchNode.hash() })

      if (keyNibbles.length === 0) {
        // The branch node itself is the value holder for the given key
        return
      }

      const branchIndex = keyNibbles[0]
      const nextNode = branchNode.children[branchIndex]
      if (nextNode.type === 'NullNode') {
        // The branch does not contain the desired key
        return
      }

      return this._createProof(nextNode, key.slice(1), stack)
    }
  }

  async createMultiProof(keys: Uint8Array[]): Promise<Uint8Array[]> {
    const proofStack: { node: Uint8Array; nodeRef: Uint8Array }[][] = []
    const root = (await this._lookupNode(this.root)) ?? new NullNode()

    for (const key of keys) {
      const stack: { node: Uint8Array; nodeRef: Uint8Array }[] = []
      await this._createProof(root, key, stack)
      proofStack.push(stack)
    }

    const maxLength = Math.max(...proofStack.map((stack) => stack.length))
    const mergedProof: Uint8Array[] = []

    for (let i = 0; i < maxLength; i++) {
      const nodesAtLevel = new Set<{
        node: Uint8Array
        nodeRef: Uint8Array
      }>()
      for (const stack of proofStack) {
        if (i < stack.length) {
          nodesAtLevel.add(stack[stack.length - i - 1])
        }
      }
      if (nodesAtLevel.size === 1) {
        // All nodes at this level are the same
        mergedProof.push([...nodesAtLevel][0].node)
      } else {
        // Nodes at this level differ
        const nodeHashes = [...nodesAtLevel].map((item) => item.nodeRef)
        mergedProof.push(...nodeHashes)
      }
    }

    return mergedProof.reverse()
  }

  async updateFromProof(proof: Uint8Array[], encoded: Uint8Array): Promise<void> {
    const root = this.root
    const isValid = await MerklePatriciaTrie.verifyProof(root, proof, encoded)
    if (!isValid) {
      throw new Error('Invalid proof')
    }

    const node = await TrieNode.decodeToNode(encoded)
    const { stack, remainingNibbles } = await this.findPath(decodeNibbles(node.hash()))

    // Check if the key already exists in the trie
    if (remainingNibbles.length === 0) {
      const existingNode = stack[stack.length - 1]
      if (existingNode.type === 'LeafNode') {
        return
      }
      if (existingNode.type === 'ExtensionNode') {
        await this._deleteNode(existingNode)
      }
    }

    // Add the new node to the trie
    await this._insertNode(node)

    // Add any missing proof nodes to the trie
    for (const hash of proof) {
      const existingNode = await this._lookupNode(hash)
      if (existingNode === null) {
        const proofNode = new ProofNode(hash)
        await this._insertNode(proofNode)
      }
    }
  }
  async updateFromMultiProof(_proof: Uint8Array[]): Promise<void> {}

  async garbageCollect(): Promise<void> {
    const reachableHashes = new Set<Uint8Array>()
    await this._markReachableNodes(await this._lookupNode(this.root), reachableHashes)
    const visitedNodes = new Set<TNode>()
    await this._collectReachableNodes(await this._lookupNode(this.root), visitedNodes)
    const nodesToDelete = [...this.nodes.values()].filter((node) => !visitedNodes.has(node))

    for (const node of nodesToDelete) {
      await this._deleteNode(node)
    }
  }

  async _markReachableNodes(node: TNode | null, reachableHashes: Set<Uint8Array>): Promise<void> {
    if (!node) {
      return
    }

    reachableHashes.add(node.hash())
    switch (node.type) {
      case 'BranchNode':
        for (const child of Object.values(await node.getChildren())) {
          await this._markReachableNodes(await this._lookupNode(child.hash()), reachableHashes)
        }
        break
      case 'ExtensionNode':
        await this._markReachableNodes(await this._lookupNode(node.child.hash()), reachableHashes)
        break
      default:
        break
    }
  }

  async _collectReachableNodes(node: TNode | null, visitedNodes: Set<TNode>): Promise<void> {
    if (node === null) {
      return
    }
    let childNode: TNode | null = null
    visitedNodes.add(node)

    switch (node.type) {
      case 'BranchNode':
        for (const child of Object.values(await node.getChildren())) {
          childNode = await this._lookupNode(child.hash())
          if (childNode && !visitedNodes.has(childNode)) {
            await this._collectReachableNodes(childNode, visitedNodes)
          }
        }
        break
      case 'ExtensionNode':
        childNode = await this._lookupNode(node.child.hash())
        if (childNode && !visitedNodes.has(childNode)) {
          await this._collectReachableNodes(childNode, visitedNodes)
        }
        break
      default:
        break
    }
  }

  async _storeNode(node: TNode): Promise<void> {
    this.cache.set(node.hash(), node)
    await this.put(node.hash(), node.rlpEncode())
  }
  async _deleteNode(node: TNode): Promise<void> {
    await this.del(node.hash())
  }
  async _insertNode(node: TNode): Promise<TNode> {
    await this._storeNode(node)
    const newRoot = await this._lookupNode(this.root)
    if (newRoot === null) {
      throw new Error('Failed to insert node')
    }
    return newRoot
  }
  async _lookupNode(key: Uint8Array): Promise<TNode | null> {
    const cachedNode = this.cache.get(key)
    if (cachedNode) {
      return cachedNode
    }

    const serializedNode = await this.db.get(key)
    if (!serializedNode) {
      return null
    }

    const node = await TrieNode.decodeToNode(serializedNode)
    this.cache.set(key, node)
    return node
  }
  async _getNode(node: TNode, key: Uint8Array): Promise<TNode | null> {
    const cachedNode = this.cache.get(node.hash())
    if (cachedNode) {
      return cachedNode
    }

    let childNode: TNode | null = null
    switch (node.type) {
      case 'BranchNode':
        if (node.children[key[node.keyNibbles.length]].type !== 'NullNode') {
          childNode = await this._lookupNode(node.children[key[node.keyNibbles.length]].hash())
        }
        break
      case 'ExtensionNode':
        if (
          key.byteLength >= node.keyNibbles.length &&
          nibblesEqual(node.keyNibbles, [...key.values()].slice(0, node.keyNibbles.length))
        ) {
          childNode = await this._lookupNode(node.child.hash())
        }
        break
      default:
        throw new Error(`Unexpected node type: ${(node as TNode).type}`)
    }

    if (!childNode) {
      return null
    }

    this.cache.set(childNode.hash(), childNode)
    return childNode
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