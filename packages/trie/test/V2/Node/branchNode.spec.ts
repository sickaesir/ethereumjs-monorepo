import { hexStringToBytes } from '@ethereumjs/util'
import { keccak256 } from 'ethereum-cryptography/keccak'
import * as tape from 'tape'

import { encodeNibbles } from '../../../src/trieV2'
import { BranchNode, ExtensionNode, LeafNode, NullNode, TrieNode } from '../../../src/trieV2/Node'

import type { TNode } from '../../../src/trieV2'

tape('BranchNode', async (t: tape.Test) => {
  t.test('fromTwoNodes', async (st) => {
    const leaf1 = new LeafNode({ key: [1, 2, 3, 4], value: Uint8Array.from([1, 2]) })
    const leaf2 = new LeafNode({ key: [5, 6, 7, 8], value: Uint8Array.from([3, 4]) })

    const branchNode = await BranchNode.fromTwoNodes(
      encodeNibbles([1, 2, 3, 4]),
      leaf1,
      encodeNibbles([5, 6, 7, 8]),
      leaf2
    )
    st.ok(branchNode instanceof BranchNode, 'Creates a BranchNode')
    st.deepEqual(branchNode.children[1], leaf1, 'The first leaf is stored correctly')
    st.deepEqual(branchNode.children[5], leaf2, 'The second leaf is stored correctly')

    const ext1 = new ExtensionNode({ keyNibbles: [1, 2], subNode: leaf1 })
    const ext2 = new ExtensionNode({ keyNibbles: [5, 6], subNode: leaf2 })

    const branchNode2 = await BranchNode.fromTwoNodes([1, 2], ext1, [5, 6], ext2)
    st.ok(branchNode2 instanceof BranchNode, 'Creates a BranchNode with ExtensionNodes')
    st.deepEqual(branchNode2.children[1], ext1, 'The first extension is stored correctly')
    st.deepEqual(branchNode2.children[5], ext2, 'The second extension is stored correctly')

    const branchNode3 = await BranchNode.fromTwoNodes(
      encodeNibbles([1, 2, 3, 4]),
      leaf1,
      [5, 6],
      ext2
    )
    st.ok(branchNode3 instanceof BranchNode, 'Creates a BranchNode with LeafNode and ExtensionNode')
    st.deepEqual(branchNode3.children[1], leaf1, 'The leaf is stored correctly')
    st.deepEqual(branchNode3.children[5], ext2, 'The extension is stored correctly')

    const nullNode = new NullNode()

    // @ts-expect-error
    const _errorCase = () => BranchNode.fromTwoNodes(nullNode, leaf1)
    st.end()
  })
  const children = await Promise.all(
    Array.from({ length: 16 }, (_v, k) => {
      return k % 2 === 0
        ? new NullNode()
        : TrieNode.create({
            key: [k],
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
    st.deepEqual(
      branch.rlpEncode(),
      branch2.rlpEncode(),
      'create produces same node as constructor'
    )
    st.equal(
      JSON.stringify(branch.children),
      JSON.stringify(children),
      'TrieNode created BranchNode with children'
    )
    st.equal(
      JSON.stringify(branch2.children),
      JSON.stringify(children),
      'BranchNode created by constructor with children'
    )
    st.equal(branch.children.length, 16, 'children attribute has null nodes')
    st.deepEqual(branch.getPartialKey(), [], 'BranchNode should have no partial key')
    st.deepEqual(branch.hash(), keccak256(branch.rlpEncode()), 'branch.hash()')
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
    let child = children[bIdx]
    st.deepEqual(
      await branch.get(encodeNibbles([...branch.keyNibbles, bIdx])),
      child instanceof LeafNode ? child.value : null,
      'branch.get found a child'
    )
    bIdx = 2
    child = children[bIdx]
    st.deepEqual(
      await branch.get(encodeNibbles([bIdx])),
      child instanceof LeafNode ? child.value : null,
      'branch.get found a child'
    )
    bIdx = 3
    child = children[bIdx]
    st.deepEqual(
      await branch.get(encodeNibbles([bIdx])),
      'value' in child ? child.value : null,
      'branch.get found a child'
    )
  })

  t.test('update', async (st) => {
    const branches = new Array(16).fill(new NullNode())
    const value = hexStringToBytes('1234')
    const branchNode = await TrieNode.create({ children: branches, value })
    const key = hexStringToBytes('1a')
    const newValue = hexStringToBytes('5678')
    const updatedBranchNode = await branchNode.update(key, newValue)

    st.deepEqual(
      await updatedBranchNode.get(key),
      newValue,
      'update should set the new value for the given key'
    )
    st.end()
  })

  t.test('delete', async (st) => {
    const branches = new Array(16).fill(new NullNode())
    const value = hexStringToBytes('1234')
    const branchNode = await TrieNode.create({ children: branches, value })
    const key = Uint8Array.from([0x0, 0xa])
    const newValue = hexStringToBytes('5678')
    const updated = await branchNode.update(key, newValue)
    const deleted = await updated.delete(key)

    st.deepEqual(await updated.get(key), newValue, 'update should set the value for the given key')

    st.deepEqual(await deleted.get(key), null, 'delete should remove the value for the given key')
    st.end()
  })

  t.test('get after multiple updates on the same key', async (st) => {
    const branches = new Array(16).fill(new NullNode())
    let branchNode = await TrieNode.create({ children: branches, value: null })
    const key = hexStringToBytes('0a')
    const value1 = hexStringToBytes('1234')
    const value2 = hexStringToBytes('5678')
    branchNode = await branchNode.update(key, value1)
    branchNode = await branchNode.update(key, value2)

    st.deepEqual(
      await branchNode.get(key),
      value2,
      'should return the latest value for the same key'
    )
    st.end()
  })

  t.test('get after multiple updates on different keys', async (st) => {
    const branches = new Array(16).fill(new NullNode())
    let branchNode = await TrieNode.create({ children: branches, value: null })
    const key1 = hexStringToBytes('0a')
    const key2 = hexStringToBytes('1b')
    const value1 = hexStringToBytes('1234')
    const value2 = hexStringToBytes('5678')
    branchNode = await branchNode.update(key1, value1)
    branchNode = await branchNode.update(key2, value2)

    st.deepEqual(
      await branchNode.get(key1),
      value1,
      'should return the correct value for the first key'
    )
    st.deepEqual(
      await branchNode.get(key2),
      value2,
      'should return the correct value for the second key'
    )
    st.end()
  })
  t.test('update with common prefix', async (st) => {
    const branches = new Array(16).fill(new NullNode())
    let branchNode = await TrieNode.create({ children: branches, value: null })
    const key1 = hexStringToBytes('0a')
    const key2 = hexStringToBytes('0b')
    const value1 = hexStringToBytes('1234')
    const value2 = hexStringToBytes('5678')
    branchNode = await branchNode.update(key1, value1)
    branchNode = await branchNode.update(key2, value2)

    st.deepEqual(
      await branchNode.get(key1),
      value1,
      'should return the correct value for the first key'
    )
    st.deepEqual(
      await branchNode.get(key2),
      value2,
      'should return the correct value for the second key'
    )
    st.end()
  })
  t.test('delete with common prefix', async (st) => {
    const branches = new Array(16).fill(new NullNode())
    let branchNode: TNode = await TrieNode.create({ children: branches, value: null })
    const key1 = hexStringToBytes('0a')
    const key2 = hexStringToBytes('0b')
    const value1 = hexStringToBytes('1234')
    const value2 = hexStringToBytes('5678')
    branchNode = await branchNode.update(key1, value1)
    branchNode = await branchNode.update(key2, value2)
    branchNode = await branchNode.delete(key1)

    st.deepEqual(
      await branchNode.get(key1),
      null,
      'should return null after deleting the first key'
    )
    st.deepEqual(
      await branchNode.get(key2),
      value2,
      'should return the correct value for the second key'
    )
    st.end()
  })

  t.end()
})
