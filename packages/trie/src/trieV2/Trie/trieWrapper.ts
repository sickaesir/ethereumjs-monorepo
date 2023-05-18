import { bytesToPrefixedHexString } from '@ethereumjs/util'
import { Mutex } from 'async-mutex'
import debug from 'debug'
import { equalsBytes } from 'ethereum-cryptography/utils'

import { LeafNode } from '../Node'
import { keyToNibbles, nibblesToKey } from '../util'

import { Trie } from './MMP'

import type { OnFoundFunction, TNode, WalkFilterFunction } from '../types'
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
  _operationMutex: Mutex

  constructor(trie?: Trie, secure?: boolean) {
    this.trie = trie ?? new Trie(undefined, secure)
    this.debug = debug(`Trie`)
    this._operationMutex = new Mutex()
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
    _value: Uint8Array | null,
    debug: Debugger = this.debug
  ): Promise<void> {
    _key = this.trie.appliedKey(_key)
    await this._withLock(async () => {
      debug = debug.extend('insert')
      const keyNibbles = keyToNibbles(_key)
      debug(`inserting new key/value node`)
      debug(`keyNibbles: [${keyNibbles}]`)
      debug.extend('ROOT_NODE')(`${this.getRoot().getType()}: ${this.getRoot().getPartialKey()}`)
      debug.extend('keyToNibbles')(`${keyNibbles}`)
      if (_value === null) {
        const newNode = await this.trie._deleteAtNode(this.getRoot(), keyNibbles, debug)
        this.setRoot(newNode)
        this.debug.extend(`**ROOT**`)(`${bytesToPrefixedHexString(this.getRootHash())}`)
      } else {
        const newNode = await this.trie._insertAtNode(
          this.getRoot(),
          keyNibbles,
          _value ?? Uint8Array.from([128]),
          debug
        )
        this.setRoot(newNode)
        this.debug.extend(`**ROOT**`)(`${bytesToPrefixedHexString(this.getRootHash())}`)
      }
    })
  }
  public async delete(key: Uint8Array, debug: Debugger = this.debug): Promise<void> {
    key = this.trie.appliedKey(key)
    await this._withLock(async () => {
      debug = debug.extend('delete')
      const keyNibbles = keyToNibbles(key)
      debug(`deleting key: ${bytesToPrefixedHexString(key)}`)
      debug.extend(`keyToNibbles`)(`${keyNibbles}`)
      const newNode = await this.trie._deleteAtNode(this.getRoot(), keyNibbles, debug)
      this.setRoot(newNode)
      debug.extend('NEW_ROOT')(
        `${this.getRoot().getType()}: ${bytesToPrefixedHexString(this.getRootHash())}`
      )
    })
  }
  public async get(key: Uint8Array, debug: Debugger = this.debug): Promise<Uint8Array | null> {
    key = this.trie.appliedKey(key)

    debug = debug.extend('get')
    const lastNode = await this.trie._getNode(key, debug)
    debug(`Returning: ${lastNode.getValue()}`)
    let value = lastNode.getValue()
    if (value && equalsBytes(value, Uint8Array.from([128]))) {
      value = null
    }
    return value
  }
  async createProof(key: Uint8Array, debug: Debugger = this.debug): Promise<TNode[]> {
    key = this.trie.appliedKey(key)
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
      const value = node.getValue() ?? null
      root = await this.trie._insertAtNode(root, keyToNibbles(key), value)
    }
  }
  async *walkTrie(
    startNode: TNode | null = this.getRoot(),
    currentKey: Uint8Array = new Uint8Array(),
    onFound: OnFoundFunction = async (_trieNode: TNode, _key: Uint8Array) => {},
    filter: WalkFilterFunction = async (_trieNode: TNode, _key: Uint8Array) => true
  ): AsyncIterable<TNode> {
    yield* this.trie._walkTrieRecursively(startNode, currentKey, onFound, filter)
  }

  async _withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this._operationMutex.acquire()
    try {
      return await operation()
    } finally {
      this._operationMutex.release()
    }
  }
}
