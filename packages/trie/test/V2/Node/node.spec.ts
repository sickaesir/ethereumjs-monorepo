import { keccak256 } from 'ethereum-cryptography/keccak'
import * as tape from 'tape'

import { encodeNibbles } from '../../../src/trieV2'
import { BaseNode, NullNode, TrieNode } from '../../../src/trieV2/Node'

tape('NullNode', async (t: tape.Test) => {
  const node = new NullNode()
  t.ok(node instanceof BaseNode, 'Node is a Node')
  t.ok(node instanceof NullNode, 'Node is a NullNode')
  t.equal(node.type, 'NullNode', 'Node has correct type')
  t.deepEqual(node.rlpEncode(), Uint8Array.from([]), 'Encoded NullNode is empty array')
  t.deepEqual(node.hash(), keccak256(Uint8Array.from([])), 'Hash of NullNode is hashed empty array')
  t.deepEqual(node.getPartialKey(), [], 'NullNode has empty partial key')
  t.deepEqual(await node.getChildren(), new Map(), 'NullNode has no children')
  t.equal((await node.delete()).type, 'NullNode', 'NullNode returns NullNode when deleted')
  t.equal(await node.get(), null, 'NullNode returns null')
})

tape('TrieNode', async (t: tape.Test) => {
  const node1 = await TrieNode.create({
    key: [1, 2, 3, 4],
    value: Uint8Array.from([5, 6, 7, 8]),
  })
  t.equal(node1.type, 'LeafNode', 'TrieNode.create creeates LeafNode from key/value')
  t.deepEqual(
    node1.key,
    encodeNibbles([1, 2, 3, 4]),
    'TrieNode.create creates LeafNode with encoded key'
  )
  t.deepEqual(node1.keyNibbles, [1, 2, 3, 4], 'TrieNode.create creates LeafNode with keyNibbles')
  t.deepEqual(
    node1.value,
    Uint8Array.from([5, 6, 7, 8]),
    'TrieNode.create creates LeafNode with value'
  )
  const node2 = await TrieNode.create({
    keyNibbles: [1],
    subNode: new NullNode(),
  })
  t.equal(node2.type, 'ExtensionNode', 'TrieNode.create creates ExtensionNode from key/subNode')
  t.deepEqual(node2.keyNibbles, [1], 'TrieNode.create creates ExtensionNode with keyNibbles')
  t.equal(node2.child.type, 'NullNode', 'TrieNode.create creates ExtensionNode with child')
  const node3 = await TrieNode.create({ key: [0, 5, 5, 5], value: Uint8Array.from([1, 1]) })
  const node4 = await TrieNode.create({
    children: [node2, node3],
    value: Uint8Array.from([9, 8, 7, 6]),
  })
  t.equal(node4.type, 'BranchNode', 'TrieNode.create creates BranchNode from children/value')
  t.deepEqual(
    node4.value,
    Uint8Array.from([9, 8, 7, 6]),
    'TrieNode.create creates BranchNode with value'
  )
  t.equal((await node4.getChildren()).size, 2, 'TrieNode.create creates BranchNode with 2 children')
})
