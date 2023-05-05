import { RLP } from '@ethereumjs/rlp'
import { hexStringToBytes } from '@ethereumjs/util'
import { keccak256 } from 'ethereum-cryptography/keccak'
import * as tape from 'tape'

import { encodeNibbles } from '../../../src/trieV2'
import { LeafNode, TrieNode } from '../../../src/trieV2/Node'

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
    const decoded = await TrieNode.decodeToNode(encoded)
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
