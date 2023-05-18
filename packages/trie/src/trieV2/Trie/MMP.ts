import { bytesToPrefixedHexString } from '@ethereumjs/util'
import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'

import { BranchNode, ExtensionNode, LeafNode, NullNode } from '../Node'
import {
  decodeNibbles,
  findCommonPrefix,
  getSharedNibbles,
  keyToNibbles,
  nibblesEqual,
} from '../util'

import { fromProof, verifyProof } from './utils'

import type { NodeType, OnFoundFunction, TNode, WalkFilterFunction } from '../types'
import type { WalkResult } from '../util'
import type { Debugger } from 'debug'

export class Trie {
  static async verifyProof(
    rootHash: Uint8Array,
    key: Uint8Array,
    proof: TNode[],
    d_bug: Debugger = debug('trie')
  ): Promise<Uint8Array | null | false> {
    return verifyProof(rootHash, key, proof, d_bug)
  }
  static async fromProof(
    rootHash: Uint8Array,
    proof: TNode[],
    d_bug: Debugger = debug('trie')
  ): Promise<Trie> {
    return fromProof(rootHash, proof, d_bug)
  }
  root: TNode
  debug: Debugger
  hashFunction: (data: Uint8Array) => Uint8Array
  secure?: boolean
  constructor(root?: TNode, secure?: boolean, hashFunction?: (data: Uint8Array) => Uint8Array) {
    this.root = root ?? new NullNode()
    this.debug = debug(`Trie`)
    this.secure = secure
    this.hashFunction = hashFunction ?? keccak256
  }
  appliedKey(key: Uint8Array) {
    if (this.secure === true) {
      return this.hashFunction(key)
    }
    return key
  }
  async _getNode(key: Uint8Array, debug: Debugger = this.debug): Promise<TNode> {
    debug = debug.extend('_getNode')
    debug(`getting value for key: ${bytesToPrefixedHexString(key)}`)
    debug(`keyToNibbles: ${keyToNibbles(key)}`)
    const { node: lastNode, remainingNibbles } = await this._walkTrie(key, debug)
    debug(`${lastNode.getType()} found`)
    debug(`remaining nibbles: [${remainingNibbles}]`)
    debug(`returning: ${lastNode.getType()} for key: ${key}`)
    return lastNode
  }
  async _insertAtNode(
    node: TNode,
    keyNibbles: number[],
    value: Uint8Array | null,
    debug: Debugger = this.debug
  ): Promise<TNode> {
    const type = node.type ?? 'NullNode'
    debug.extend('_insertAtNode')(`inserting node:${keyNibbles}`)
    debug.extend('_insertAtNode')(`at ${node.getType()}: ${node.getPartialKey()}`)
    debug = debug.extend('_insertAtNode').extend(type)
    const _insert: {
      [type in NodeType]: () => Promise<TNode>
    } = {
      NullNode: async (): Promise<LeafNode> => {
        debug(`inserting into NullNode`)
        return new LeafNode({ key: keyNibbles, value })
      },
      LeafNode: async (): Promise<TNode> => {
        const toReplace = node as LeafNode
        const toReplaceNibbles = toReplace.getPartialKey()
        const { commonPrefix, remainingNibbles1, remainingNibbles2 } = findCommonPrefix(
          keyNibbles,
          toReplaceNibbles
        )
        const remainingNibblesNew = remainingNibbles1
        const remainingNibblesOld = remainingNibbles2
        if (remainingNibblesNew.length === 0 && remainingNibblesOld.length === 0) {
          debug(`inserting into LeafNode with same key`)
          return new LeafNode({ key: keyNibbles, value })
        } else {
          debug(`inserting into LeafNode with different key`)
          debug(`remainingNibblesOld: [${remainingNibblesOld}]`)
          debug(`remainingNibblesNew: [${remainingNibblesNew}]`)
          const branchNode = new BranchNode()
          if (remainingNibblesOld.length === 0) {
            debug(
              `splitting LeafNode into BranchNode with child on branch ${remainingNibblesNew[0]}`
            )
            await branchNode.updateValue(toReplace.getValue())
            branchNode.setChild(
              remainingNibblesNew[0],
              new LeafNode({ key: remainingNibblesNew.slice(1), value })
            )
          } else if (remainingNibblesNew.length === 0) {
            debug(
              `splitting LeafNode into BranchNode with child on branch ${remainingNibblesOld[0]}`
            )
            await branchNode.updateValue(value)
            branchNode.setChild(
              remainingNibblesOld[0],
              new LeafNode({ key: remainingNibblesOld.slice(1), value: toReplace.getValue() })
            )
          } else {
            debug(
              `splitting LeafNode into BranchNode with children on branches ${remainingNibblesNew[0]} and ${remainingNibblesOld[0]}`
            )
            debug.extend('BranchNode')(
              `[${remainingNibblesOld[0]}] [${remainingNibblesOld.slice(1)}]`
            )
            debug.extend('BranchNode')(
              `[${remainingNibblesNew[0]}] [${remainingNibblesNew.slice(1)}]`
            )
            branchNode.setChild(
              remainingNibblesOld[0],
              await toReplace.updateKey(remainingNibblesOld.slice(1))
            )
            branchNode.setChild(
              remainingNibblesNew[0],
              new LeafNode({ key: remainingNibblesNew.slice(1), value })
            )
          }
          // If there's a common prefix, create an extension node.
          if (commonPrefix.length > 0) {
            debug.extend(`ExtensionNode`)(`inserting with keyNibbles: [${commonPrefix}]`)
            const extension = new ExtensionNode({ keyNibbles: commonPrefix, subNode: branchNode })
            return this._cleanupNode(extension)
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
          if (sharedNibbles.length === keyNibbles.length) {
            debug(
              `shared nibbles: ${sharedNibbles} match entirely and are same length.  update child value.`
            )
            const newChild = await extensionNode.child.updateValue(value)
            return extensionNode.updateChild(newChild)
          }
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
          debug(`remainingOldNibbles: [${remainingOldNibbles}]`)
          debug(`remainingNewNibbles: [${remainingNewNibbles}]`)
          const oldBranchNodeIndex = remainingOldNibbles.shift()!
          const newLeafNodeIndex = remainingNewNibbles.shift()!
          const newLeafNode = new LeafNode({ key: remainingNewNibbles, value })
          const newBranchNode = new BranchNode()
          debug(
            `splitting ExtensionNode into BranchNode with children on branches ${newLeafNodeIndex} and ${oldBranchNodeIndex}`
          )
          if (remainingOldNibbles.length > 0) {
            const newExtensionNode = new ExtensionNode({
              keyNibbles: remainingOldNibbles,
              subNode: extensionNode.child,
            })
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
            newBranchNode.value = (extensionNode.child as any).value
            debug(`inserting as new branchNode`)
            return newBranchNode
          }
        }
      },
      ProofNode: async () => {
        throw new Error('method not implemented')
      },
    }
    const preCleanup = await _insert[type]()
    const newRoot = await this._cleanupNode(preCleanup, debug)
    debug.extend('NEW_ROOT')(bytesToPrefixedHexString(newRoot.hash()))
    return newRoot
  }
  async _deleteAtNode(_node: TNode, _keyNibbles: number[], debug: Debugger = this.debug) {
    debug = debug.extend('_deleteAtNode')
    debug.extend(_node.getType())(
      `Seeking Node to DELETE: (${_keyNibbles.length}) [${_keyNibbles}]`
    )
    const d: {
      [type in NodeType]: () => Promise<TNode>
    } = {
      NullNode: async () => {
        return _node
      },
      LeafNode: async () => {
        const leafNode = _node as LeafNode
        if (nibblesEqual(leafNode.getPartialKey(), _keyNibbles)) {
          debug(`found leaf node to delete, replacing with null`)
          return new NullNode()
        } else {
          return new NullNode()
        }
      },
      ExtensionNode: async () => {
        const extensionNode = _node as ExtensionNode
        const sharedNibbles = getSharedNibbles(_keyNibbles, extensionNode.getPartialKey())
        debug('')
        if (sharedNibbles.length === extensionNode.getPartialKey().length) {
          debug(`shared nibbles match entirely.  nativagating from extension node into child node`)
          debug(
            `shared (${sharedNibbles.length}): [${sharedNibbles}] remaining: (${
              _keyNibbles.slice(sharedNibbles.length).length
            })[${_keyNibbles.slice(sharedNibbles.length)}]`
          )
          const newChild = await this._deleteAtNode(
            extensionNode.child,
            _keyNibbles.slice(sharedNibbles.length),
            debug
          )
          extensionNode.updateChild(newChild)
          return extensionNode
        } else {
          return extensionNode
        }
      },
      BranchNode: async () => {
        const branchNode = _node as BranchNode
        const childIndex = _keyNibbles[0]!
        const childNode = branchNode.getChild(childIndex)
        if (childNode) {
          debug(`navigating from BranchNode into childnode at index ${childIndex}`)
          debug(
            `index: (1) [${childIndex}] remaining: (${
              _keyNibbles.slice(1).length
            }) [${_keyNibbles.slice(1)}]`
          )
          if (childNode.getType() === 'LeafNode') {
            if (nibblesEqual(childNode.getPartialKey(), _keyNibbles)) {
              debug(`found leaf node to delete, replacing with null`)
              branchNode.setChild(childIndex, new NullNode())
              return branchNode
            }
          }
          const updatedChildNode = await this._deleteAtNode(childNode, _keyNibbles.slice(1), debug)
          branchNode.updateChild(updatedChildNode, childIndex)
          return branchNode
        } else {
          return branchNode
        }
      },
      ProofNode: async () => {
        throw new Error('method not implemented')
      },
    }
    const deleted = await d[_node.getType()]()
    return this._cleanupNode(deleted, debug)
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
          childIndex = keyNibbles[nibbleIndex]
          if (childIndex === undefined) {
            debug.extend(currentNode.getType())(`Child index is undefined, returning`)
            return { node: currentNode as BranchNode, remainingNibbles: [] }
          }
          debug.extend(currentNode.getType())(
            `Searching for child at index ${keyNibbles[nibbleIndex]}`
          )
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
            if (nibbleIndex === keyNibbles.length) {
              debug.extend(currentNode.getType())(`Reached end of key.`)
              return { node: currentNode.child, remainingNibbles: [] }
            }
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

  async _cleanupNode(node: TNode, debug: Debugger = this.debug): Promise<TNode> {
    debug = debug.extend('_cleanupNode')
    debug(`Cleaning up node: ${node.getType()}`)
    debug(`keyNibbles: ${node.getPartialKey()}`)
    // If the node is a branch node, check the number of children.
    if (node instanceof BranchNode) {
      debug = debug.extend('BranchNode')
      if (node.childNodes().size === 0) {
        debug(`Branch node has no children, converting to LeafNode`)
        return new LeafNode({
          key: node.keyNibbles,
          value: node.value,
        })
      }
      // If there's only one child, replace the branch node with that child.
      if (node.childNodes().size === 1 && node.value === null) {
        const c = node.childNodes().entries().next().value
        debug(`Branch node has only one child, replacing with child: ${c[0]}: ${c[1].getType()}`)
        const [idx, _child] = c as [number, TNode]
        debug(`updating key of child [${idx}] + [${_child.getPartialKey()}]`)
        const replace = await _child.updateKey([idx, ..._child.getPartialKey()])
        debug.extend(`${replace.getType()}`)(`updated key: [${replace.getPartialKey()}]`)
        return this._cleanupNode(replace)
        // const compacted = new ExtensionNode({
        //   keyNibbles: [idx],
        //   subNode: _child,
        //   value: node.value,
        // })
        // return this._cleanupNode(compacted)
      } else {
        debug(`Branch node has ${node.childNodes().size} children, returning`)
        return node
      }
    } else if (node instanceof ExtensionNode) {
      debug = debug.extend('ExtensionNode')
      // If the node is an extension node, we check if the child is a leaf node
      // or another extension node.
      const child = node.child
      if (child instanceof LeafNode) {
        debug(`Child is a leaf node.  Replacing Extension with LeafNode with concatenated key`)
        debug(
          `(${node.getPartialKey().length})[${node.getPartialKey()}] + (${
            child.getPartialKey().length
          })[${child.getPartialKey()}]`
        )
        // If the child is a leaf node, we concatenate the key nibbles of the
        // extension node and the child.
        return new LeafNode({
          key: [...node.getPartialKey(), ...child.getPartialKey()],
          value: child.value,
        })
      } else if (child instanceof ExtensionNode) {
        debug(`Child is an extension node.  Converting to ExtensionNode with concatenated key`)
        debug(
          `(${node.getPartialKey().length})[${node.getPartialKey()}] + (${
            child.getPartialKey().length
          })[${child.getPartialKey()}]`
        )
        // If the child is an extension node, we concatenate the key nibbles of
        // the extension node and the child.
        const subNode = await this._cleanupNode(child.child)
        const extension = new ExtensionNode({
          keyNibbles: [...node.getPartialKey(), ...child.getPartialKey()],
          subNode,
        })
        return this._cleanupNode(extension)
      } else if (child instanceof BranchNode && child.value === null) {
        if (child.childNodes().size === 1) {
          const [k, childNode] = child.childNodes().entries().next().value
          const subNode = await this._cleanupNode(childNode)
          if (subNode instanceof LeafNode) {
            debug(
              `Child is a branch node with one LeafNode child, converting ExtensionNode to ${subNode.getType()}`
            )
            debug.extend('LeafNode')(`
            keyNibbles: [${[...node.getPartialKey(), k, ...subNode.getPartialKey()]}]`)
            return new LeafNode({
              key: [...node.getPartialKey(), k, ...subNode.getPartialKey()],
              value: subNode.value,
            })
          }
          const extension = new ExtensionNode({
            keyNibbles: node.getPartialKey(),
            subNode,
          })
          return this._cleanupNode(extension)
        } else if (child.childNodes().size === 0 && child.value === null) {
          debug(`Child is a branch node with no children and no value, converting to NullNode`)
          return new NullNode()
        } else {
          debug(`Child is a branch node with more than one child, returning`)
          return node
        }
      }
    }

    // If the node is not a branch node, or it's a branch node with more than
    // one child, there's nothing to clean up and we return the node as is.
    return node
  }

  async *_walkTrieRecursively(
    node: TNode | null,
    currentKey: Uint8Array = Uint8Array.from([]),
    onFound: OnFoundFunction = async (_trieNode: TNode, _key: Uint8Array) => {},
    filter: WalkFilterFunction = async (_trieNode: TNode, _key: Uint8Array) => true
  ): AsyncIterable<TNode> {
    if (node === null) {
      return
    }
    if (await filter(node, currentKey)) {
      await onFound(node, currentKey)
      yield node
    }
    switch (node.type) {
      case 'BranchNode': {
        for (const [nibble, childNode] of (node as BranchNode).childNodes().entries()) {
          const nextKey = Uint8Array.from([...currentKey, nibble])
          yield* this._walkTrieRecursively(childNode, nextKey, onFound, filter)
        }
        break
      }
      case 'ExtensionNode': {
        const childNode = await this._getNode(node.child.hash())
        const nextKey = Uint8Array.from([...currentKey, ...node.keyNibbles])
        yield* this._walkTrieRecursively(childNode, nextKey, onFound, filter)
        break
      }
      default:
        break
    }
  }
}
