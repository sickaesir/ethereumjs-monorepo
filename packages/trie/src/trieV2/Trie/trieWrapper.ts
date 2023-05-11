import { bytesToPrefixedHexString } from '@ethereumjs/util'
import debug from 'debug'
import { equalsBytes } from 'ethereum-cryptography/utils'

import { LeafNode } from '../Node'
import { keyToNibbles, nibblesToKey } from '../util'

import { Trie } from './MMP'

import type { TNode } from '../types'
import type { Debugger } from 'debug'

export class TrieWrap {
  static async fromProof(
    rootHash: Uint8Array,
    proof: TNode[],
    dbug: Debugger = debug('trie')
  ): Promise<TrieWrap> {
    dbug = dbug.extend('fromProof')
    dbug(`Creating trie from proof`)
    const trie = await Trie.fromProof(rootHash, proof, dbug)
    return new TrieWrap(trie)
  }
  static verifyProof = Trie.verifyProof
  trie: Trie
  debug: Debugger
  constructor(trie?: Trie) {
    this.trie = trie ?? new Trie()
    this.debug = debug(`Trie`)
  }
  getRootHash(): Uint8Array {
    return this.getRoot().hash()
  }
  setRoot(root: TNode) {
    this.trie.root = root
  }
  getRoot(): TNode {
    return this.trie.root
  }
  public async insert(
    _key: Uint8Array,
    _value: Uint8Array,
    debug: Debugger = this.debug
  ): Promise<void> {
    debug = debug.extend('insert')
    const keyNibbles = keyToNibbles(_key)
    debug(`inserting new key/value node`)
    debug.extend('keyToNibbles')(`${keyNibbles}`)
    const newNode = await this.trie._insertAtNode(this.getRoot(), keyNibbles, _value, debug)
    this.setRoot(newNode)
    this.debug.extend(`**ROOT**`)(`${bytesToPrefixedHexString(this.getRootHash())}`)
  }
  public async delete(key: Uint8Array, debug: Debugger = this.debug): Promise<void> {
    debug = debug.extend('delete')
    const keyNibbles = keyToNibbles(key)
    debug(`deleting key: ${bytesToPrefixedHexString(key)}`)
    debug.extend(`keyToNibbles`)(`${keyNibbles}`)
    const newNode = await this.trie._deleteAtNode(this.getRoot(), keyNibbles, debug)
    this.setRoot(newNode)
    debug.extend('NEW_ROOT')(
      `${this.getRoot().getType()}: ${bytesToPrefixedHexString(this.getRootHash())}`
    )
  }
  public async get(key: Uint8Array, debug: Debugger = this.debug): Promise<Uint8Array | null> {
    debug = debug.extend('get')
    const lastNode = await this.trie._getNode(key, debug)
    return lastNode?.getValue() ?? null
  }
  async createProof(key: Uint8Array, debug: Debugger = this.debug): Promise<TNode[]> {
    debug = debug.extend('createProof')
    debug(`Creating proof for key: ${key}`)
    const path = keyToNibbles(key)
    let node = this.getRoot()
    const proof = []

    while (path.length > 0) {
      proof.push(node)
      if (node instanceof LeafNode) {
        debug('Proof creation successful for key: %O', key)
        return proof
      }
      const child = node.getChild(path[0])
      if (!child) {
        return proof
      }
      node = child
      path.shift()
    }
    return proof
  }
  async updateFromProof(
    rootHash: Uint8Array,
    proof: TNode[],
    debug: Debugger = this.debug
  ): Promise<void> {
    debug = debug.extend('updateFromProof')
    debug(`Updating Trie from proof`)
    if (!proof.length) {
      throw new Error('Proof is empty')
    }
    let root = proof[0]
    if (!equalsBytes(rootHash, root.hash())) {
      throw new Error('Proof root hash does not match expected root hash')
    }
    this.setRoot(root)
    for (let i = 1; i < proof.length; i++) {
      const node = proof[i]
      const key = nibblesToKey(node.getPartialKey())
      debug(`Inserting node at path: ${key}`)
      root = await this.trie._insertAtNode(
        root,
        keyToNibbles(key),
        node.getValue() ?? new Uint8Array()
      )
    }
  }
}
