import { randomBytes } from '@ethereumjs/util'
import debug from 'debug'
import { equalsBytes, utf8ToBytes } from 'ethereum-cryptography/utils'
import * as tape from 'tape'

import { BranchNode, LeafNode, TrieNode } from '../../../src/trieV2'
import { Trie } from '../../../src/trieV2/Trie/MMP'

tape('MMPT', async (t) => {
  t.test('insert/get', async (st) => {
    const trie = new Trie()
    const value = await trie.get(Uint8Array.from([1, 2, 3, 4]))
    st.equal(value, null, 'get should return null for a non-existent key')
    const keyA = utf8ToBytes('keyA')
    const valueA = utf8ToBytes('valueA')
    await trie.insert(keyA, valueA)
    const retrievedValueA = await trie.get(keyA)
    st.deepEqual(retrievedValueA, valueA, 'get should return the correct value for an existing key')
    const keyB = utf8ToBytes('keyB')
    const valueB = utf8ToBytes('valueB')
    await trie.insert(keyB, valueB)
    const retrievedValueB = await trie.get(keyB)
    st.deepEqual(retrievedValueB, valueB, 'get should return the correct value for a new key')
    const retrievedValueA2 = await trie.get(keyA)
    st.deepEqual(
      retrievedValueA2,
      valueA,
      'get should return the correct value for a key after inserting new keys'
    )
    const keyC = utf8ToBytes('keyC')
    const valueC = utf8ToBytes('valueC')
    await trie.insert(keyC, valueC)
    const retrievedValueC = await trie.get(keyC)
    st.deepEqual(retrievedValueC, valueC, 'get should return the correct value for a new key')
    const retrievedValueB2 = await trie.get(keyB)
    st.deepEqual(
      retrievedValueB2,
      valueB,
      'get should return the correct value for an existing key'
    )
    const retrievedValueA3 = await trie.get(keyA)
    st.deepEqual(
      retrievedValueA3,
      valueA,
      'get should return the correct value for a key after inserting new keys'
    )
    const keyX = utf8ToBytes('somethingverydifferent')
    const valueX = utf8ToBytes('valueX')
    await trie.insert(keyX, valueX)
    const retrievedValueX = await trie.get(keyX)
    st.deepEqual(retrievedValueX, valueX, 'get should return the correct value for a new key')

    const retrievedValueA4 = await trie.get(keyA)
    st.deepEqual(
      retrievedValueA4,
      valueA,
      'get should return the correct value for a key after inserting new keys'
    )
    const retrievedValueB3 = await trie.get(keyB)
    st.deepEqual(
      retrievedValueB3,
      valueB,
      'get should return the correct value for an existing key'
    )
    const retrievedValueC2 = await trie.get(keyC)
    st.deepEqual(retrievedValueC2, valueC, 'get should return the correct value for a new key')

    const keyRand = randomBytes(20)
    const valueRand = randomBytes(32)
    await trie.insert(keyRand, valueRand)
    const retrievedValueRand = await trie.get(keyRand)
    st.deepEqual(retrievedValueRand, valueRand, 'get should return the correct value for a new key')

    const retrievedValueA5 = await trie.get(keyA)
    st.deepEqual(
      retrievedValueA5,
      valueA,
      'get should return the correct value for a key after inserting new keys'
    )
    const retrievedValueB4 = await trie.get(keyB)
    st.deepEqual(
      retrievedValueB4,
      valueB,
      'get should return the correct value for an existing key'
    )
    const retrievedValueC3 = await trie.get(keyC)
    st.deepEqual(retrievedValueC3, valueC, 'get should return the correct value for a new key')

    const retrievedValueX2 = await trie.get(keyX)
    st.deepEqual(retrievedValueX2, valueX, 'get should return the correct value for a new key')

    st.end()
  })
  t.test('insert/get (big)', async (st) => {
    const d_bug = debug('test:trie')
    const trie = new Trie()
    const value = await trie.get(Uint8Array.from([1, 2, 3, 4]), d_bug)
    st.equal(value, null, 'get should return null for a non-existent key')
    const keys = Array.from({ length: 100 }, () => randomBytes(20))
    const values = Array.from({ length: 100 }, () => randomBytes(32))
    for await (const [idx, key] of keys.entries()) {
      await trie.insert(key, values[idx], d_bug)
      const retrievedJustAdded = await trie.get(key, d_bug)
      st.deepEqual(
        retrievedJustAdded,
        values[idx],
        `get should return the correct value for key that was just added: ${idx}`
      )
      for (const [i, k] of [...keys.entries()].slice(0, idx + 1).reverse()) {
        const retrieved = await trie.get(k, d_bug)
        if (retrieved && equalsBytes(retrieved, values[i])) {
          continue
        } else {
          st.fail(`Failed to return the correct value for key ${i}`)
          st.end()
          return
        }
      }
      st.pass('Returned correct value for all added keys')
    }
    st.pass(`Insert/Get test passed. Awesome!`)
    st.end()
  })
  t.test('insert/get/delete (big)', async (st) => {
    const d_bug = debug('test:trie')
    const testLength = 200
    const trie = new Trie()
    const value = await trie.get(Uint8Array.from([1, 2, 3, 4]), d_bug)
    st.equal(value, null, 'get should return null for a non-existent key')
    const keys = Array.from({ length: testLength }, () => randomBytes(20))
    const values = Array.from({ length: testLength }, () => randomBytes(32))
    for await (const [idx, key] of keys.entries()) {
      await trie.insert(key, values[idx], d_bug)
    }
    const deleted: number[] = [-1]
    for (let i = 0; i < testLength; i++) {
      let idx = deleted[0]
      while (deleted.includes(idx)) {
        idx = Math.floor(Math.random() * keys.length)
      }
      const preRoot = trie.root.hash()
      await trie.delete(keys[idx], d_bug)
      st.notDeepEqual(preRoot, trie.root.hash(), `delete should change the root hash`)
      const expectNull = await trie.get(keys[idx], d_bug)
      st.equal(expectNull, null, `get should return null for a deleted key`)
      if (expectNull !== null) {
        st.fail(`get key${idx}:${keys[idx]}`)
        st.end()
        return
      }
      deleted.push(idx)
      for (const d of deleted.slice(1)) {
        const retrieved = await trie.get(keys[d], d_bug)
        if (retrieved !== null) {
          st.fail(`get key${d}:${keys[d]}`)
          st.end()
          return
        }
      }
      st.pass(`Returned Null for all deleted keys`)
      for (let d = 0; d < keys.length - deleted.length; d++) {
        let checkIdx = deleted[0]
        while (deleted.includes(checkIdx)) {
          checkIdx = Math.floor(Math.random() * keys.length)
        }
        const retrieved = await trie.get(keys[checkIdx], d_bug)
        if (!retrieved || !equalsBytes(retrieved, values[checkIdx])) {
          st.fail(`failed to return correct value for key ${checkIdx}`)
          st.end()
          return
        }
      }
      st.pass(`Returned correct value for all non-deleted keys`)
    }
    st.pass('Delete Test Passed.  Good Job!')
    st.end()
  })
  t.test('decodeToNode', async (st) => {
    const d_bug = debug('test:trie')
    const leafNodes = Array.from({ length: 8 }, (_, i) => {
      const key = [0xa, i]
      const value = Uint8Array.from([i + 1])
      return new LeafNode({ key, value })
    })
    for await (const leaf of leafNodes) {
      const encoded = leaf.rlpEncode()
      debug('test:decodeToNode')(`'encoded', ${encoded}`)
      const decoded = await TrieNode.decodeToNode(encoded, d_bug)
      st.equal(decoded.getType(), 'LeafNode', 'should decode to a LeafNode')
      if (decoded.getType() !== 'LeafNode') {
        st.end()
        return
      }
    }
    const branchNode = new BranchNode({
      children: leafNodes,
      value: Uint8Array.from([0x9]),
    })
    const encoded = branchNode.rlpEncode()
    const decoded = await TrieNode.decodeToNode(encoded, d_bug)
    st.equal(decoded.getType(), 'BranchNode', 'should decode to a BranchNode')
    st.end()
  })

  t.test('create proof / verify proof', async (st) => {
    const d_bug = debug('test:proof')
    const testLength = 100
    const trie = new Trie()
    const keys = Array.from({ length: testLength }, () => randomBytes(20))
    const values = Array.from({ length: testLength }, () => randomBytes(32))
    for await (const [idx, key] of keys.entries()) {
      await trie.insert(key, values[idx], d_bug)
    }
    for await (const [idx, key] of keys.entries()) {
      const node = await trie.getNode(key, d_bug)
      const retrieved = await trie.get(key, d_bug)
      if (!node || !retrieved || !equalsBytes(retrieved, values[idx])) {
        st.fail(`failed to return correct node and value for key ${idx}`)
        st.end()
        return
      }
      st.deepEqual(
        node.getValue(),
        retrieved,
        `node value should match retrieved value for key ${idx}`
      )
      const proof = await trie.createProof(key, d_bug)
      const fromProof = await Trie.fromProof(trie.root.hash(), proof, d_bug)
      st.deepEqual(fromProof.root.hash(), trie.root.hash(), `proof should create the same root`)
      st.ok(proof, `Proof for key ${idx} should exist -- length:${proof.length}`)
      const verified = await Trie.verifyProof(trie.root.hash(), key, proof, d_bug)
      if (
        node?.getValue() &&
        !equalsBytes(verified instanceof Uint8Array ? verified : Uint8Array.from([]), values[idx])
      ) {
        st.fail(
          `Proof for ${key} failed at index ${idx}. returned incorrect value: ${verified} -- expected: ${values[idx]}`
        )
        st.end()
        return
      }
      st.deepEqual(verified, node?.getValue(), `Proof for key ${idx} should verify`)
    }
    const sampleSize = Math.floor(testLength / 5)
    for (let i = 0; i < sampleSize; i++) {
      const deleteIdx = Math.floor((Math.random() * keys.length * (i + 1)) / sampleSize)
      const toDelete = keys[deleteIdx]
      await trie.delete(toDelete, d_bug)
      const deleted = await trie.get(toDelete, d_bug)
      st.equal(deleted, null, `deleted key should return null`)
      try {
        const nullProof = await trie.createProof(toDelete, d_bug)
        st.ok(
          nullProof,
          `Proof for deleted key ${deleteIdx} should exist -- length:${nullProof.length}`
        )
      } catch (e) {
        st.fail(`Failed to create proof for deleted key ${deleteIdx}: ${(e as any).message}`)
        throw e
        // st.end()
        // return
      }
    }
    st.end()
  })
})
