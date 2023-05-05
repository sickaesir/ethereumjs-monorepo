import { hexStringToBytes } from '@ethereumjs/util'
import * as tape from 'tape'

import { encodeNibbles } from '../../../src/trieV2'
import { TrieNode } from '../../../src/trieV2/Node'

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
