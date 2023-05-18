import debug from 'debug'
import { equalsBytes } from 'ethereum-cryptography/utils'

import { BranchNode, ExtensionNode, LeafNode, NullNode } from '../Node'
import { keyToNibbles, nibblesToKey } from '../util'

import { Trie } from './MMP'

import type { TNode } from '../types'
import type { Debugger } from 'debug'

export async function verifyProof(
  rootHash: Uint8Array,
  key: Uint8Array,
  proof: TNode[],
  d_bug: Debugger = debug('trie')
): Promise<Uint8Array | null | false> {
  d_bug = d_bug.extend('verifyProof')
  d_bug(`Verifying proof for key:  ${key}`)
  d_bug.extend('keyNibbles')(keyToNibbles(key))
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
      return false
    }
    node = child
    path.shift()
  }

  if (node instanceof LeafNode) {
    d_bug.extend('LeafNode')(`Proof verification successful for key: ${key}`)
    return node.getValue() ?? null
  } else if (node instanceof NullNode) {
    throw new Error('maybe this should throw?')
  } else if (node instanceof ExtensionNode) {
    d_bug.extend('ExtensionNode')(`Proof verification successful for key: ${key}`)
    return node.child.getValue() ?? null
  } else if (node instanceof BranchNode) {
    if (path.length === 0) {
      return node.getValue() ?? null
    } else if (node.getChild(path[0])) {
      d_bug.extend('BranchNode')(`Proof verification successful for key: ${key}`)
      return node.getChild(path[0])!.getValue() ?? null
    } else {
      return false
    }
  } else {
    return false
  }
}
export async function fromProof(
  rootHash: Uint8Array,
  proof: TNode[],
  d_bug: Debugger = debug('trie')
): Promise<Trie> {
  d_bug = d_bug.extend('fromProof')
  d_bug(`Building Trie from proof`)
  if (!proof.length) {
    throw new Error('Proof is empty')
  }
  let root = proof[0]
  if (!equalsBytes(rootHash, root.hash())) {
    throw new Error('Proof root hash does not match expected root hash')
  }
  const trie = new Trie({ root })
  for (let i = 1; i < proof.length - 1; i++) {
    const node = proof[i]
    const key = nibblesToKey(node.getPartialKey())
    const value = node.getValue() ?? null
    d_bug(`Inserting node at path: ${key}`)
    root = await trie._insertAtNode(root, keyToNibbles(key), value)
  }
  return trie
}
