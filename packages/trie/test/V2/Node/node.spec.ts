import { RLP } from '@ethereumjs/rlp'
import { hexStringToBytes } from '@ethereumjs/util'
import { keccak256 } from 'ethereum-cryptography/keccak'
import * as tape from 'tape'

import { encodeNibbles } from '../../../src/trieV2'
import { BranchNode, ExtensionNode, LeafNode, NullNode, TrieNode } from '../../../src/trieV2/Node'

tape('LeafNode', async (t: tape.Test) => {
  const key = [1, 2, 3, 4]
  const encodedKey = encodeNibbles(key)
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
    st.deepEqual(node.key, encodedKey)
    st.deepEqual(node.keyNibbles, key)
    st.deepEqual(leafNode.key, encodedKey)
    st.deepEqual(leafNode.keyNibbles, key)
    st.deepEqual(node.value, value)
    st.deepEqual(leafNode.value, value)
    st.deepEqual(node.keyNibbles, [1, 2, 3, 4])
    st.deepEqual(leafNode.keyNibbles, [1, 2, 3, 4])
    st.deepEqual(await node.getChildren(), new Map())
    st.deepEqual(await leafNode.getChildren(), new Map())
    st.end()
  })
  t.test('get', async (st: tape.Test) => {
    const result = await node.get(encodeNibbles(key))
    st.deepEqual(result, value)
    const nullResult = await node.get(new Uint8Array([1, 2, 3, 5]))
    st.equal(nullResult, null)
    st.deepEqual(node.getPartialKey(), node.keyNibbles)
    st.deepEqual([...(await node.getChildren()).entries()], [], 'Leaf Node should have no children')
    st.end()
  })
  t.test('encode/decode/hash', async (st: tape.Test) => {
    const encoded = node.rlpEncode()
    st.deepEqual(encoded, RLP.encode([encodedKey, value]))
    const decoded = await TrieNode.decode(encoded)
    const hash = node.hash()
    st.equal(decoded.type, 'LeafNode')
    st.equal(JSON.stringify(decoded), JSON.stringify(node))
    st.deepEqual(hash, keccak256(encoded))
    st.end()
  })
  t.test('update', async (st) => {
    const newValue = hexStringToBytes('0x5678')
    const updatedLeafNode = await leafNode.update(encodeNibbles(key), newValue)
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
        ? null
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
    st.deepEqual(branch.children, children, 'TrieNode created BranchNode with children')
    st.deepEqual(branch2.children, children, 'BranchNode created by constructor with children')
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
    st.deepEqual(
      await branch.get(Uint8Array.from([bIdx])),
      children[bIdx]?.value ?? null,
      'branch.get found a child'
    )
    bIdx = 2
    st.deepEqual(
      await branch.get(Uint8Array.from([bIdx])),
      children[bIdx]?.value ?? null,
      'branch.get found a child'
    )
    bIdx = 3
    st.deepEqual(
      await branch.get(Uint8Array.from([bIdx])),
      children[bIdx]?.value ?? null,
      'branch.get found a child'
    )
  })

  t.test('update', async (st) => {
    const branches = new Array(16).fill(null)
    const value = hexStringToBytes('1234')
    const branchNode = await TrieNode.create({ children: branches, value })
    const key = hexStringToBytes('1a') // Use a complete byte for the key
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
    const branches = new Array(16).fill(null)
    const value = hexStringToBytes('1234')
    const branchNode = await TrieNode.create({ children: branches, value })
    const key = hexStringToBytes('0a')
    const newValue = hexStringToBytes('5678')
    await branchNode.update(key, newValue)
    const deletedBranchNode = await branchNode.delete(key)

    st.deepEqual(
      await deletedBranchNode.get(key),
      null,
      'delete should remove the value for the given key'
    )
    st.end()
  })

  t.end()
})
tape('ExtensionNode', (t) => {
  t.test('get', async (st) => {
    const key = [0x1]
    const value = hexStringToBytes('1234')
    const child = await TrieNode.create({ key, value })

    const partialKey = [0xa]
    const extensionNode = await TrieNode.create({ keyNibbles: partialKey, subNode: child })

    st.deepEqual(
      await extensionNode.get(encodeNibbles([0xa1])),
      value,
      'get should return the value for the given key'
    )
    st.end()
  })

  t.test('update', async (st) => {
    const key = [0x1]
    const value = hexStringToBytes('1234')
    const child = await TrieNode.create({ key, value })

    const partialKey = [0xa]
    const extensionNode = await TrieNode.create({ keyNibbles: partialKey, subNode: child })

    const newKey = encodeNibbles([0xa2])
    const newValue = hexStringToBytes('5678')
    const updatedExtensionNode = await extensionNode.update(newKey, newValue)

    st.deepEqual(
      await updatedExtensionNode.get(encodeNibbles([0xa2])),
      newValue,
      'update should set the new value for the given key'
    )
    st.end()
  })

  t.test('delete', async (st) => {
    const key = [0xa1]
    const value = hexStringToBytes('1234')
    const child = await TrieNode.create({ key, value })

    const partialKey = [0xa]
    const extensionNode = await TrieNode.create({ keyNibbles: partialKey, subNode: child })

    const deletedExtensionNode = await extensionNode.delete(encodeNibbles(key))

    st.deepEqual(
      await deletedExtensionNode.get(encodeNibbles(key)),
      null,
      'delete should remove the value for the given key'
    )
    st.end()
  })

  t.test('edge cases', async (st) => {
    const key = [0xa1]
    const value = hexStringToBytes('1234')
    const child = await TrieNode.create({ key, value })

    const partialKey = [0xa]
    const extensionNode = await TrieNode.create({ keyNibbles: partialKey, subNode: child })

    const nonExistingKey = hexStringToBytes('b1')
    st.deepEqual(
      await extensionNode.get(nonExistingKey),
      null,
      'get should return null for a non-existing key'
    )

    const nonExistingKeyUpdate = hexStringToBytes('b2')
    const newValue = hexStringToBytes('5678')
    const updatedExtensionNode = await extensionNode.update(nonExistingKeyUpdate, newValue)
    st.deepEqual(
      await updatedExtensionNode.get(nonExistingKeyUpdate),
      null,
      'update should not create a new value for a non-matching key'
    )

    const nonExistingKeyDelete = hexStringToBytes('b1')
    const deletedExtensionNode = await extensionNode.delete(nonExistingKeyDelete)
    st.deepEqual(
      deletedExtensionNode,
      extensionNode,
      'delete should not change the extension node when deleting a non-existing key'
    )

    st.end()
  })
})
