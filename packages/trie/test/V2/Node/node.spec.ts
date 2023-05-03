import { RLP } from '@ethereumjs/rlp'
import { hexStringToBytes } from '@ethereumjs/util'
import { keccak256 } from 'ethereum-cryptography/keccak'
import * as tape from 'tape'

import { BranchNode, LeafNode, TrieNode } from '../../../src/trieV2/Node'

tape('LeafNode', async (t: tape.Test) => {
  const key = new Uint8Array([1, 2, 3, 4])
  const value = new Uint8Array([5, 6, 7, 8])
  const node = await TrieNode.create({ key, value })
  const leafNode = new LeafNode({ key, value })

  t.test('constructor', async (st: tape.Test) => {
    st.deepEqual(
      node.key,
      leafNode.key,
      'Leaf Node created from constructor matches TrieNode.create method'
    )
    st.deepEqual(
      node.value,
      leafNode.value,
      'Leaf Node created from constructor matches TrieNode.create method'
    )
    st.ok('key' in node, 'Leaf Node has Key')
    st.ok('value' in node, 'Leaf Node has Value')
    st.deepEqual(node.key, key)
    st.deepEqual(leafNode.key, key)
    st.deepEqual(node.value, value)
    st.deepEqual(leafNode.value, value)
    st.deepEqual(node.keyNibbles, [0, 1, 0, 2, 0, 3, 0, 4])
    st.deepEqual(leafNode.keyNibbles, [0, 1, 0, 2, 0, 3, 0, 4])
    st.deepEqual(await node.getChildren(), new Map())
    st.deepEqual(await leafNode.getChildren(), new Map())
    st.end()
  })
  t.test('get', async (st: tape.Test) => {
    const result = await node.get(key)
    st.deepEqual(result, value)
    const nullResult = await node.get(new Uint8Array([1, 2, 3, 5]))
    st.equal(nullResult, null)
    st.deepEqual(node.getPartialKey(), node.keyNibbles)
    st.end()
  })
  t.test('encode/decode/hash', async (st: tape.Test) => {
    const encoded = node.encode()
    st.deepEqual(encoded, RLP.encode([key, value]))
    const decoded = await TrieNode.decode(encoded)
    const hash = node.hash()
    st.equal(decoded.type, 'LeafNode')
    st.equal(JSON.stringify(decoded), JSON.stringify(node))
    st.deepEqual(hash, keccak256(encoded))
    st.end()
  })

  t.test('update', async (st) => {
    const newValue = hexStringToBytes('0x5678')
    const updatedLeafNode = await leafNode.update(key, newValue)
    st.deepEqual(
      updatedLeafNode.value,
      newValue,
      'update should set the new value for the given key'
    )
    st.end()
  })

  t.end()
})
tape('BranchNode', async (t: tape.Test) => {
  const children = await Promise.all(
    Array.from({ length: 16 }, (_v, k) => {
      return k % 2 === 0
        ? null
        : TrieNode.create({
            key: Uint8Array.from([0, k]),
            value: Uint8Array.from([1, 2, 3, k]),
          })
    })
  )
  const branch = await TrieNode.create({
    children,
    value: Uint8Array.from([0, 1, 2, 3]),
  })
  const branch2 = new BranchNode({
    children,
    value: Uint8Array.from([0, 1, 2, 3]),
  })

  t.test('create/constructor', async (st) => {
    st.equal(branch.type, 'BranchNode', 'Trie.create produced a BranchNode')
    st.deepEqual(branch.encode(), branch2.encode(), 'create produces same node as constructor')
    st.deepEqual(branch.children, children, 'TrieNode created BranchNode with children')
    st.deepEqual(branch2.children, children, 'BranchNode created by constructor with children')
    st.equal(branch.children.length, 16, 'children attribute has null nodes')
    st.deepEqual(branch.getPartialKey(), [], 'BranchNode should have no partial key')
    st.deepEqual(branch.hash(), keccak256(branch.encode()), 'branch.hash()')
    st.end()
  })

  t.test('getChildren / get', async (st) => {
    st.equal((await branch.getChildren()).size, 8, 'getChildren method returns non null children')
    st.deepEqual(
      await branch.get(Uint8Array.from([])),
      branch.value,
      'branch.get() returned branch.value'
    )
    st.deepEqual(
      await branch.get(Uint8Array.from([])),
      Uint8Array.from([0, 1, 2, 3]),
      'branch.get() returned branch.value'
    )
    let bIdx = 1
    st.deepEqual(
      await branch.get(Uint8Array.from([bIdx, 0, bIdx])),
      children[bIdx]?.value ?? null,
      'branch.get found a child'
    )
    bIdx = 2
    st.deepEqual(
      await branch.get(Uint8Array.from([bIdx, 0, bIdx])),
      children[bIdx]?.value ?? null,
      'branch.get found a child'
    )
    bIdx = 3
    st.deepEqual(
      await branch.get(Uint8Array.from([bIdx, 0, bIdx])),
      children[bIdx]?.value ?? null,
      'branch.get found a child'
    )
  })

  t.test('update', async (st) => {
    const branches = new Array(16).fill(null)
    const value = hexStringToBytes('1234')
    const branchNode = await TrieNode.create({ children: branches, value })
    const key = hexStringToBytes('a')
    const newValue = hexStringToBytes('5678')
    const updatedBranchNode = await branchNode.update(key, newValue)

    st.deepEqual(
      await updatedBranchNode.get(key),
      newValue,
      'update should set the new value for the given key'
    )
  })

  t.end()
})
