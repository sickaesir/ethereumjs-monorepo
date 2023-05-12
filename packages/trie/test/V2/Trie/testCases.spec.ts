import { bytesToPrefixedHexString, randomBytes } from '@ethereumjs/util'
import debug from 'debug'
import { equalsBytes, utf8ToBytes } from 'ethereum-cryptography/utils'
import * as tape from 'tape'

import { BranchNode, LeafNode, TrieNode } from '../../../src/trieV2'
import { Trie } from '../../../src/trieV2/Trie/MMP'
import { TrieWrap } from '../../../src/trieV2/Trie/trieWrapper'

import type { OnFoundFunction, TNode } from '../../../src/trieV2'

tape('MMPT', async (t) => {
  t.test('insert/get', async (st) => {
    const trie = new TrieWrap()
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
    const trie = new TrieWrap()
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
    const testLength = 100
    const trie = new TrieWrap()
    const value = await trie.get(Uint8Array.from([1, 2, 3, 4]), d_bug)
    st.equal(value, null, 'get should return null for a non-existent key')
    const keys = Array.from({ length: testLength }, () => randomBytes(20))
    const values = Array.from({ length: testLength }, () =>
      randomBytes(32 + Math.ceil(Math.random() * 224))
    )
    for await (const [idx, key] of keys.entries()) {
      await trie.insert(key, values[idx], d_bug)
    }
    for await (const [idx, key] of keys.entries()) {
      const retrieved = await trie.get(key, d_bug)
      if (retrieved && equalsBytes(retrieved, values[idx])) {
        continue
      } else {
        st.fail(`Failed to return the correct value for key ${idx}`)
        st.end()
        return
      }
    }

    const deleted: number[] = [-1]
    for await (const _i of Array.from({ length: testLength }, (_, i) => i)) {
      let idx = deleted[0]
      while (deleted.includes(idx)) {
        idx = Math.floor(Math.random() * keys.length)
      }
      const preRoot = trie.getRootHash()
      await trie.delete(keys[idx], d_bug)
      st.notDeepEqual(preRoot, trie.getRootHash(), `delete should change the root hash`)
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
      let k = 0
      for await (const [idx, key] of keys.entries()) {
        if (deleted.includes(idx)) {
          continue
        } else {
          k++
          const retrieved = await trie.get(key, d_bug)
          if (!retrieved || !equalsBytes(retrieved, values[idx])) {
            st.fail(
              `failed to return correct value for not-deleted key ${idx}.  returned ${retrieved}`
            )
            st.end()
            return
          }
        }
      }
      st.equal(
        k,
        keys.length - (deleted.length - 1),
        `get should return the correct value for all non-deleted keys`
      )
      st.pass(`Returned correct value for ${keys.length - deleted.length} non-deleted keys`)
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
    const trie = new TrieWrap()
    const keys = Array.from({ length: testLength }, () => randomBytes(20))
    const values = Array.from({ length: testLength }, () => randomBytes(32))
    for await (const [idx, key] of keys.entries()) {
      await trie.insert(key, values[idx], d_bug)
    }
    for await (const [idx, key] of keys.entries()) {
      const retrieved = await trie.get(key, d_bug)
      if (!retrieved || !equalsBytes(retrieved, values[idx])) {
        st.fail(`failed to return correct node and value for key ${idx}`)
        st.end()
        return
      }
      const proof = await trie.createProof(key, d_bug)
      const fromProof = await Trie.fromProof(trie.getRootHash(), proof, d_bug)
      st.deepEqual(fromProof.root.hash(), trie.getRootHash(), `proof should create the same root`)
      st.ok(proof, `Proof for key ${idx} should exist -- length:${proof.length}`)
      const verified = await TrieWrap.verifyProof(trie.getRootHash(), key, proof, d_bug)
      if (
        !equalsBytes(verified instanceof Uint8Array ? verified : Uint8Array.from([]), values[idx])
      ) {
        st.fail(
          `Proof for ${key} failed at index ${idx}. returned incorrect value: ${verified} -- expected: ${values[idx]}`
        )
        st.end()
        return
      }
      st.deepEqual(verified, values[idx], `Proof for key ${idx} should verify`)
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
      }
    }
    st.end()
  })
  t.test('walkTrie', async (st) => {
    const d_bug = debug('test:proof')
    const testLength = 100
    const trie = new TrieWrap()
    const keys = Array.from({ length: testLength }, () => randomBytes(20))
    const uniqueKeys = Array.from(new Set(keys.map((k) => bytesToPrefixedHexString(k))))
    const values = Array.from({ length: keys.length }, () => randomBytes(32))
    const uniqueValues = Array.from(new Set(values.map((v) => bytesToPrefixedHexString(v))))
    for await (const [idx, key] of keys.entries()) {
      await trie.insert(key, values[idx], d_bug)
    }
    for await (const [idx, key] of keys.entries()) {
      const retrieved = await trie.get(key, d_bug)
      if (!retrieved || !equalsBytes(retrieved, values[idx])) {
        st.fail(`failed to return correct node and value for key ${idx}`)
        st.end()
        return
      }
    }
    let i = 0
    let f = 0
    let leafNodes = 0
    let branchNodes = 0
    let extensionNodes = 0
    let valueNodes = 0

    const foundNodes: [Uint8Array, TNode][] = []
    const branches: Map<string, { parent: number; branch: number }> = new Map()
    const valuesFound: string[] = []
    const onFound: OnFoundFunction = async (node, key) => {
      if (node.getType() === 'BranchNode') {
        branchNodes++
        for await (const child of node.getChildren()) {
          branches.set(bytesToPrefixedHexString(child[1].hash()), { parent: f, branch: child[0] })
        }
      } else if (node.getType() === 'LeafNode') {
        leafNodes++
      } else if (node.getType() === 'ExtensionNode') {
        extensionNodes++
      }
      foundNodes.push([key, node])
      const val = node.getValue()
      if (val) {
        valueNodes++
        valuesFound.push(bytesToPrefixedHexString(val))
      }
      f++
    }
    const walk = trie.walkTrie(trie.getRoot(), new Uint8Array(), onFound)

    //  uncomment code to see trie readout
    for await (const _ of walk) {
      const walkIdx = i++
      // let parentIdx: number | undefined
      // let branch: number | undefined
      // const hash = bytesToPrefixedHexString(_.hash())
      // if (branches.has(hash)) {
      //   parentIdx = branches.get(hash)!.parent
      //   branch = branches.get(hash)!.branch
      // }
      if (_.getType() === 'BranchNode') {
        const c: { [k: typeof walkIdx]: number }[] = []
        for await (const child of _.getChildren()) {
          c.push({ [walkIdx]: child[0] })
        }
        // console.log({
        //   [walkIdx]: {
        //     node: _.getType(),
        //     branch: { [`${parentIdx}`]: branch },
        //   },
        //   children: c,
        // })
      } else {
        //   console.log({
        //     [walkIdx]: {
        //       node: _.getType(),
        //     },
        //     branch: { [`${parentIdx}`]: branch },
        //   })
      }
    }
    const uniqueValuesFound = Array.from(new Set(valuesFound))
    const missingValues = uniqueValues.filter((v) => !uniqueValuesFound.includes(v))
    const missingValueIdx = missingValues.map((v) => {
      const idx = values.findIndex((vv) => bytesToPrefixedHexString(vv) === v)
      return idx
    })
    console.log({
      uniqueKeys: uniqueKeys.length,
      foundNodes: foundNodes.length,
      leafNodes,
      branchNodes,
      extensionNodes,
      valueNodes,
      valuesFound: valuesFound.length,
      uniqueValuesFound: uniqueValuesFound.length,
      missingValues: missingValues.length,
    })
    st.ok(
      uniqueValuesFound.length >= uniqueKeys.length * 0.96,
      `walk trie touched ${(uniqueValuesFound.length * 100) / uniqueKeys.length}% of ${
        uniqueKeys.length
      } key/value nodes`
    )
    for (const idx of missingValueIdx) {
      const retrievedMissing = await trie.get(keys[idx], d_bug)
      st.deepEqual(retrievedMissing, values[idx], `should find missing value for key ${idx}`)
    }
    st.end()
  })
})
