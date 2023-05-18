import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { EventEmitter } from 'events'

import { NullNode } from '../Node'

import { _cleanupNode } from './cleanup'
import { _deleteAtNode } from './delete'
import { _getNode } from './getNode'
import { _insertAtNode } from './insert'
import { fromProof, verifyProof } from './proof'

import type { BranchNode } from '../Node'
import type { OnFoundFunction, TNode, WalkFilterFunction } from '../types'
import type { Debugger } from 'debug'

export interface MerklePatriciaTrieOptions {
  root?: TNode
  secure?: boolean
  hashFunction?: (data: Uint8Array) => Uint8Array
  debug?: Debugger
}
export class MerklePatriciaTrie extends EventEmitter {
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
  ): Promise<MerklePatriciaTrie> {
    return fromProof(rootHash, proof, d_bug)
  }
  root: TNode
  debug: Debugger
  hashFunction: (data: Uint8Array) => Uint8Array
  secure?: boolean
  constructor(options: MerklePatriciaTrieOptions = {}) {
    super()
    this.root = options.root ?? new NullNode()
    this.debug = options.debug ? options.debug.extend(`Trie`) : debug('Trie')
    this.secure = options.secure
    this.hashFunction = options.hashFunction ?? keccak256
  }
  async _getNode(key: Uint8Array, debug: Debugger = this.debug): Promise<TNode> {
    const { node: lastNode } = await _getNode(this.root, key, debug)
    debug(`returning: ${lastNode.getType()} for key: ${key}`)
    return lastNode
  }
  async _insertAtNode(
    node: TNode,
    keyNibbles: number[],
    value: Uint8Array | null,
    debug: Debugger = this.debug
  ): Promise<TNode> {
    return _insertAtNode(node, keyNibbles, value, debug)
  }
  async _deleteAtNode(_node: TNode, _keyNibbles: number[], debug: Debugger = this.debug) {
    return _deleteAtNode(_node, _keyNibbles, debug)
  }
  async _cleanupNode(node: TNode, debug: Debugger = this.debug): Promise<TNode> {
    return _cleanupNode(node, debug, this)
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
