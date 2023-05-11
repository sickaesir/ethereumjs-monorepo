import { bytesToPrefixedHexString } from '@ethereumjs/util'
import debug from 'debug'
import { equalsBytes } from 'ethereum-cryptography/utils'

import { BranchNode, ExtensionNode, LeafNode, NullNode } from '../Node'
import {
  decodeNibbles,
  findCommonPrefix,
  getSharedNibbles,
  keyToNibbles,
  nibblesEqual,
} from '../util'

import type { NodeType, TNode } from '../types'
import type { WalkResult } from '../util'
import type { Debugger } from 'debug'

export class Trie {
  static async verifyProof(
    rootHash: Uint8Array,
    key: Uint8Array,
    proof: TNode[],
    d_bug: Debugger = debug('trie')
  ): Promise<Uint8Array | null> {
    d_bug = d_bug.extend('verifyProof')
    d_bug(`Verifying proof for key:  ${key}`)
    if (!proof.length) {
      throw new Error('Proof is empty')
    }
    let node = proof[0]
    if (!equalsBytes(rootHash, node.hash())) {
      throw new Error('Proof root hash does not match expected root hash')
    }
    const path = keyToNibbles(key)

    for (let i = 1; i < proof.length; i++) {
      debug(`Searching child on index ${path[0]}`)
      const child = node.getChild(path[0]) ?? new NullNode()
      if (!equalsBytes(child.hash(), proof[i].hash())) {
        throw new Error('Proof is invalid')
      }
      node = child
      path.shift()
    }

    if (node instanceof LeafNode) {
      d_bug(`Proof verification successful for key: ${key}`)
      return node.getValue() ?? null
    } else {
      throw new Error('Proof is invalid')
    }
  }
  root: TNode
  debug: Debugger
  constructor(root?: TNode) {
    this.root = root ?? new NullNode()
    this.debug = debug(`Trie`)
  }
  async insert(_key: Uint8Array, _value: Uint8Array, debug: Debugger = this.debug): Promise<void> {
    debug = debug.extend('insert')
    const keyNibbles = keyToNibbles(_key)
    debug(`inserting new key/value node`)
    debug.extend('keyToNibbles')(`${keyNibbles}`)
    const newNode = await this._insertAtNode(this.root, keyNibbles, _value, debug)
    this.root = newNode
    this.debug.extend(`**ROOT**`)(`${bytesToPrefixedHexString(this.root.hash())}`)
  }
  async delete(key: Uint8Array, debug: Debugger = this.debug): Promise<void> {
    debug = debug.extend('delete')
    const keyNibbles = keyToNibbles(key)
    debug(`deleting key: ${bytesToPrefixedHexString(key)}`)
    debug.extend(`keyToNibbles`)(`${keyNibbles}`)
    const newNode = await this._deleteAtNode(this.root, keyNibbles, debug)
    this.root = newNode
    debug.extend('NEW_ROOT')(
      `${this.root.getType()}: ${bytesToPrefixedHexString(this.root.hash())}`
    )
  }
  public async get(key: Uint8Array, debug: Debugger = this.debug): Promise<Uint8Array | null> {
    debug = debug.extend('get')
    const lastNode = await this.getNode(key, debug)
    return lastNode?.getValue() ?? null
  }
  public async getNode(key: Uint8Array, debug: Debugger = this.debug): Promise<TNode | null> {
    debug = debug.extend('get')
    debug(`getting value for key: ${bytesToPrefixedHexString(key)}`)
    debug(`keyToNibbles: ${keyToNibbles(key)}`)
    const { node: lastNode, remainingNibbles } = await this._walkTrie(key, debug)
    debug(`${lastNode.getType()} found`)
    debug(`[${remainingNibbles}]`)
    'value' in lastNode && debug.extend('VALUE')(`[${lastNode.getValue() ?? null}]`)
    if (remainingNibbles.length === 0) {
      if (lastNode.type === 'LeafNode' || (lastNode.type === 'BranchNode' && lastNode.value)) {
        debug(`returning value: ${lastNode.getValue()} for key: ${key}`)
        return lastNode
      }
    }
    return lastNode
  }
  async createProof(key: Uint8Array, debug: Debugger = this.debug): Promise<TNode[]> {
    debug = debug.extend('createProof')
    debug(`Creating proof for key: ${key}`)
    const path = keyToNibbles(key)
    let node = this.root
    const proof = []

    while (path.length > 0) {
      proof.push(node)
      if (node instanceof LeafNode) {
        debug('Proof creation successful for key: %O', key)
        return proof
      }
      const child = node.getChild(path[0])
      if (!child) {
        throw new Error('Key not found in trie')
      }
      node = child
      path.shift()
    }
    throw new Error('Error in createProof')
  }
  // async createProof(_key: Uint8Array, debug: Debugger = this.debug): Promise<Uint8Array[]> {
  //   debug = debug.extend('createProof')
  //   debug({ _key })
  //   const proof: Uint8Array[] = []
  //   let keyNibbles = keyToNibbles(_key)
  //   let currentNode = this.root

  //   while (keyNibbles.length > 0) {
  //     switch (currentNode.getType()) {
  //       case 'NullNode':
  //         keyNibbles = []
  //         break
  //       case 'LeafNode':
  //         if (nibblesEqual(keyNibbles, currentNode.getPartialKey())) {
  //           proof.push(currentNode.rlpEncode())
  //           keyNibbles = []
  //         } else {
  //           keyNibbles = []
  //         }
  //         break
  //       case 'BranchNode':
  //         proof.push(currentNode.rlpEncode())
  //         currentNode = currentNode.getChild(keyNibbles.shift()!)!
  //         break
  //       case 'ExtensionNode':
  //         if (nibblesEqual(keyNibbles, currentNode.getPartialKey())) {
  //           proof.push(currentNode.rlpEncode())
  //           keyNibbles = removeNibbles(keyNibbles, currentNode.getPartialKey().length)
  //           currentNode = (currentNode as ExtensionNode).getChild()
  //         } else {
  //           keyNibbles = []
  //         }
  //         break
  //       case 'ProofNode':
  //         throw new Error('ProofNodes are not supported')
  //     }
  //   }
  //   return proof
  // }
  async _insertAtNode(
    node: TNode,
    keyNibbles: number[],
    value: Uint8Array,
    debug: Debugger = this.debug
  ): Promise<TNode> {
    const type = node.type ?? 'NullNode'
    debug.extend('_insertAtNode')(`inserting node:${keyNibbles}`)
    debug.extend('_insertAtNode')(`at ${node.getType()}: ${node.getPartialKey()}`)
    debug = debug.extend('_insertAtNode').extend(type)
    const _insert: {
      [type in NodeType]: () => Promise<TNode>
    } = {
      NullNode: async (): Promise<TNode> => {
        debug(`inserting into NullNode`)
        return new LeafNode({ key: keyNibbles, value })
      },
      LeafNode: async (): Promise<TNode> => {
        const leafNode = node as LeafNode
        const leafKeyNibbles = leafNode.getPartialKey()
        const { commonPrefix, remainingNibbles1, remainingNibbles2 } = findCommonPrefix(
          keyNibbles,
          leafKeyNibbles
        )
        const remainingNibblesNew = remainingNibbles1
        const remainingNibblesOld = remainingNibbles2
        const newLeafIdx = remainingNibblesNew[0]!
        if (remainingNibblesNew.length === 0 && remainingNibblesOld.length === 0) {
          debug(`inserting into LeafNode with same key`)
          return new LeafNode({ key: keyNibbles, value })
        } else {
          debug(`inserting into LeafNode with different key`)
          debug(
            `splitting LeafNode into BranchNode with children on branches ${newLeafIdx} and ${remainingNibblesOld[0]}`
          )
          const branchNode = new BranchNode()
          branchNode.setChild(
            newLeafIdx,
            new LeafNode({ key: remainingNibblesNew.slice(1), value })
          )
          branchNode.setChild(remainingNibbles2[0], leafNode.updateKey(remainingNibbles2.slice(1)))
          // If there's a common prefix, create an extension node.
          if (commonPrefix.length > 0) {
            debug(`inserting as ExtensionNode: ${commonPrefix} with new branchNode as child`)
            return new ExtensionNode({ keyNibbles: commonPrefix, subNode: branchNode })
          } else {
            debug(`inserting as new branchNode`)
            return branchNode
          }
        }
      },
      BranchNode: async () => {
        const branchNode = node as BranchNode
        const childIndex = keyNibbles.shift()!
        debug(`inserting into BranchNode at index ${childIndex}`)
        let childNode = branchNode.getChild(childIndex)
        if (childNode) {
          debug(
            `${childNode.getType()}: [${childNode.getPartialKey()}] found at index ${childIndex}.  Updating child.`
          )
          const newChild = await this._insertAtNode(childNode, keyNibbles, value)
          branchNode.updateChild(newChild, childIndex)
        } else {
          debug(`NullNode found at index ${childIndex}.  Creating new LeafNode and updating child.`)
          childNode = new LeafNode({ key: keyNibbles, value })
          branchNode.setChild(childIndex, childNode)
        }
        debug(`inserting as updated BranchNode`)
        return branchNode
      },
      ExtensionNode: async () => {
        const extensionNode = node as ExtensionNode
        const sharedNibbles = getSharedNibbles(keyNibbles, extensionNode.getPartialKey())
        if (sharedNibbles.length === extensionNode.getPartialKey().length) {
          debug(`shared nibbles: ${sharedNibbles} match entirely.  update child.`)
          const newChild = await this._insertAtNode(
            extensionNode.child,
            keyNibbles.slice(sharedNibbles.length),
            value,
            debug.extend('ExtensionNode')
          )
          extensionNode.updateChild(newChild)
          return extensionNode
        } else {
          debug(`shared nibbles: ${sharedNibbles} do not match entirely.`)
          const remainingOldNibbles = node.getPartialKey().slice(sharedNibbles.length)
          const remainingNewNibbles = keyNibbles.slice(sharedNibbles.length)
          const oldBranchNodeIndex = remainingOldNibbles.shift()!
          const newLeafNodeIndex = remainingNewNibbles.shift()!
          const newLeafNode = new LeafNode({ key: remainingNewNibbles, value })
          const newExtensionNode = new ExtensionNode({
            keyNibbles: remainingOldNibbles,
            subNode: extensionNode.child,
          })
          const newBranchNode = new BranchNode()
          debug(
            `splitting ExtensionNode into BranchNode with children on branches ${newLeafNodeIndex} and ${oldBranchNodeIndex}`
          )
          if (remainingOldNibbles.length > 0) {
            debug(
              `inserting as ExtensionNode: ${remainingOldNibbles} with new extensionNode as child`
            )
            newBranchNode.setChild(oldBranchNodeIndex, newExtensionNode)
          } else {
            newBranchNode.setChild(oldBranchNodeIndex, extensionNode.child)
          }
          newBranchNode.setChild(newLeafNodeIndex, newLeafNode)
          if (sharedNibbles.length > 0) {
            debug(`inserting as ExtensionNode: ${sharedNibbles} with new branchNode as child`)
            return new ExtensionNode({ keyNibbles: sharedNibbles, subNode: newBranchNode })
          } else {
            debug(`inserting as new branchNode`)
            return newBranchNode
          }
        }
      },
      ProofNode: async () => {
        throw new Error('method not implemented')
      },
    }
    const inserted = await _insert[type]()
    return inserted
  }
  async _deleteAtNode(_node: TNode, _keyNibbles: number[], debug: Debugger = this.debug) {
    debug = debug.extend('_deleteAtNode')
    debug.extend(_node.getType())(`Deleting node: ${_keyNibbles}`)
    const d: {
      [type in NodeType]: () => Promise<TNode>
    } = {
      NullNode: async () => {
        return _node
      },
      LeafNode: async () => {
        const leafNode = _node as LeafNode
        if (nibblesEqual(leafNode.getPartialKey(), _keyNibbles)) {
          debug(`found leaf node to delete`)
          return new NullNode()
        } else {
          throw new Error('leaf does not match key to delete')
        }
      },
      ExtensionNode: async () => {
        const extensionNode = _node as ExtensionNode
        const sharedNibbles = getSharedNibbles(_keyNibbles, extensionNode.getPartialKey())
        debug('nativagating from extension node into child node')
        if (sharedNibbles.length === extensionNode.getPartialKey().length) {
          debug(`shared nibbles: ${sharedNibbles} match entirely.  delete child.`)
          const newChild = await this._deleteAtNode(
            extensionNode.child,
            _keyNibbles.slice(sharedNibbles.length),
            debug
          )
          extensionNode.updateChild(newChild)
          return this._cleanupNode(extensionNode, debug)
        } else {
          return extensionNode
        }
      },
      BranchNode: async () => {
        const branchNode = _node as BranchNode
        const childIndex = _keyNibbles.shift()!
        debug(`navigating from BranchNode into childnode at index ${childIndex}`)
        const childNode = branchNode.getChild(childIndex)
        if (childNode) {
          const updatedChildNode = await this._deleteAtNode(childNode, _keyNibbles, debug)
          branchNode.updateChild(updatedChildNode, childIndex)
          return branchNode
          // return this._cleanupNode(branchNode, debug)
        } else {
          return branchNode
        }
      },
      ProofNode: async () => {
        throw new Error('method not implemented')
      },
    }
    return d[_node.getType()]()
  }

  private async _walkTrie(key: Uint8Array, debug: Debugger = this.debug): Promise<WalkResult> {
    debug = debug.extend('_walkTrie')
    const keyNibbles = decodeNibbles(key)
    let currentNode: TNode = this.root
    debug(`Starting at (root): ${currentNode.getType()} [${currentNode.getPartialKey()}]`)
    debug(`Searching for: ${keyNibbles}`)
    const path = []
    let nibbleIndex = 0
    while (currentNode.type !== 'NullNode') {
      debug.extend(currentNode.getType())(`Pushing node to path`)
      path.push(currentNode)
      let childIndex: number | undefined
      let childNode: TNode | undefined
      let sharedNibbles: number[]
      let keySharedNibbles: number[]
      switch (currentNode.type) {
        case 'BranchNode':
          debug.extend(currentNode.getType())(
            `Searching for child at index ${keyNibbles[nibbleIndex]}`
          )
          childIndex = keyNibbles[nibbleIndex]
          if (childIndex === undefined) {
            return { node: currentNode as BranchNode, remainingNibbles: [] }
          }
          childNode = (currentNode as BranchNode).getChild(childIndex)
          debug.extend(currentNode.getType())(
            `Found ${childNode?.getType()}: ${childNode?.getPartialKey()} at index ${childIndex}`
          )
          if (childNode) {
            nibbleIndex++
            currentNode = childNode
          } else {
            debug.extend(currentNode.getType())(`Child not found, returning`)
            return { node: currentNode, remainingNibbles: keyNibbles.slice(nibbleIndex) }
          }

          break
        case 'ExtensionNode':
          sharedNibbles = (currentNode as ExtensionNode).getPartialKey()
          keySharedNibbles = keyNibbles.slice(nibbleIndex, nibbleIndex + sharedNibbles.length)
          debug.extend(currentNode.getType())(`Shared nibbles: ${sharedNibbles}`)
          if (nibblesEqual(sharedNibbles, keySharedNibbles)) {
            debug.extend(currentNode.getType())(`Shared nibbles match entirely.`)
            nibbleIndex += sharedNibbles.length
            currentNode = (currentNode as ExtensionNode).child
          } else {
            debug.extend(currentNode.getType())(`Shared nibbles do not match.`)
            return { node: new NullNode(), remainingNibbles: keyNibbles.slice(nibbleIndex) }
          }
          break
        case 'LeafNode':
          if (
            nibblesEqual(keyNibbles.slice(nibbleIndex), (currentNode as LeafNode).getPartialKey())
          ) {
            debug.extend(currentNode.getType())(`Nibbles Match`)
            return { node: currentNode as LeafNode, remainingNibbles: [] }
          } else {
            debug.extend(currentNode.getType())(`Nibbles Do Not Match`)
            return { node: new NullNode(), remainingNibbles: keyNibbles.slice(nibbleIndex) }
          }
      }
      debug(`CurrentNode: ${currentNode.getType()}: ${currentNode.getPartialKey()}`)
    }
    debug(`Returning NullNode`)
    return {
      node: new NullNode(),
      remainingNibbles: keyNibbles.slice(nibbleIndex),
    }
  }

  private _cleanupNode(node: TNode, debug: Debugger = this.debug): TNode {
    debug = debug.extend('_cleanupNode')
    debug(node.getType())
    if (node.getType() === 'ExtensionNode') {
      const extensionNode = node as ExtensionNode
      const nextNode = extensionNode.getChild()
      if (nextNode instanceof ExtensionNode) {
        debug(`compressing extension nodes`)
        const newSharedNibbles = extensionNode.getPartialKey().concat(nextNode.getPartialKey())
        return new ExtensionNode({ keyNibbles: newSharedNibbles, subNode: nextNode.child })
      }
    } else if (node.getType() === 'BranchNode') {
      const branchNode = node as BranchNode
      const nonNullChildren = branchNode.getChildren()
      const [childIndex, childNode]: [number, TNode] = nonNullChildren.entries().next().value
      const newSharedNibbles = [childIndex].concat(childNode.getPartialKey())
      if (childNode.type === 'ExtensionNode') {
        return new ExtensionNode({ keyNibbles: newSharedNibbles, subNode: childNode.getChild()! })
      } else if (childNode.type === 'LeafNode') {
        return new LeafNode({
          key: newSharedNibbles,
          value: childNode.value,
        })
      }
    }
    return node
  }
}
