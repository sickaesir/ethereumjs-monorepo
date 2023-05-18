import {
  bytesToPrefixedHexString,
  equalsBytes,
  hexStringToBytes,
  utf8ToBytes,
} from '@ethereumjs/util'
import * as tape from 'tape'

import * as hexencoded from '../../../../ethereum-tests/TrieTests/hex_encoded_securetrie_test.json'
import * as trieanyorder from '../../../../ethereum-tests/TrieTests/trieanyorder.json'
import * as secure_anyOrder from '../../../../ethereum-tests/TrieTests/trieanyorder_secureTrie.json'
import * as trietest from '../../../../ethereum-tests/TrieTests/trietest.json'
import * as securetest from '../../../../ethereum-tests/TrieTests/trietest_secureTrie.json'
import { Trie } from '../../../src'
import { TrieWrap } from '../../../src/trieV2/Trie/trieWrapper'

console.log(Object.keys(trietest))
tape('trietest.json', async (_tape) => {
  _tape.test('emptyValues', async (t) => {
    const test = trietest.emptyValues
    t.pass(`${test.in}`)
    const trie_v2 = new TrieWrap()
    const trie_v1 = new Trie()
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    const toTest: Map<string | null, string | null> = new Map()
    for await (const [idx, [k, v]] of test.in.entries()) {
      const key = utf8ToBytes(k!)
      const value = typeof v === 'string' ? utf8ToBytes(v) : null
      const value_v1 = v !== null ? utf8ToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      toTest.set(k, v)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      t.deepEqual(v2_root, v1_root, `${idx}: root hash should match`)
      for await (const [_k, _v] of toTest.entries()) {
        const _value = typeof _v === 'string' ? utf8ToBytes(_v) : null
        const stored_v2 = await trie_v2.get(utf8ToBytes(_k!))
        t.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(rootHashv1, test.root, 'root hash v1 should match')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    t.equal(rootHashv2, test.root, 'root hash v2 should match')
    t.end()
  })
  _tape.test('branchingTests', async (t) => {
    const test = trietest.branchingTests
    t.pass(`${test.in}`)
    const trie_v2 = new TrieWrap()
    const trie_v1 = new Trie()
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    for await (const [idx, [k, v]] of test.in.entries()) {
      const key = hexStringToBytes(k!)
      const value = typeof v === 'string' ? utf8ToBytes(v) : null
      const value_v1 = v !== null ? utf8ToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      t.deepEqual(v2_root, v1_root, 'v2 new root hash should match v1')
      for await (const [_idx, [_k, _v]] of test.in.slice(0, idx + 1).entries()) {
        if (test.in.slice(0, idx + 1).filter((i) => i[0] === _k).length > 1 && _v !== null) {
          // skip if value has been updated
          continue
        }
        const _value = typeof _v === 'string' ? utf8ToBytes(_v) : null
        const stored_v2 = await trie_v2.get(hexStringToBytes(_k!))
        t.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(rootHashv1, test.root, 'root hash v1 should match test root')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    t.equal(rootHashv2, test.root, 'root hash v2 should match test root')
    t.end()
  })
  _tape.test('jeff', async (t) => {
    const test = trietest.jeff
    t.pass(`${test.in}`)
    const trie_v2 = new TrieWrap()
    const trie_v1 = new Trie()
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    for await (const [idx, [k, v]] of test.in.entries()) {
      const key = hexStringToBytes(k!)
      const value = typeof v === 'string' ? hexStringToBytes(v) : null
      const value_v1 = v !== null ? hexStringToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      t.deepEqual(v2_root, v1_root, 'v2 new root hash should match v1')

      for await (const [_idx, [_k, _v]] of test.in.slice(0, idx + 1).entries()) {
        if (test.in.slice(0, idx + 1).filter((i) => i[0] === _k).length > 1 && _v !== null) {
          // skip if value has been updated
          continue
        }
        const _value = typeof _v === 'string' ? hexStringToBytes(_v) : null
        const stored_v2 = await trie_v2.get(hexStringToBytes(_k!))
        t.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(rootHashv1, test.root, 'root hash v1 should match test root')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    t.equal(rootHashv2, test.root, 'root hash v2 should match test root')
    t.end()
  })
  _tape.test('insert-middle-leaf', async (t) => {
    const test = trietest['insert-middle-leaf']
    t.pass(`${test.in}`)
    const trie_v2 = new TrieWrap()
    const trie_v1 = new Trie()
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    for await (const [idx, [k, v]] of test.in.entries()) {
      const key = utf8ToBytes(k!)
      const value = typeof v === 'string' ? utf8ToBytes(v) : null
      const value_v1 = v !== null ? utf8ToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      t.deepEqual(v2_root, v1_root, 'v2 new root hash should match v1')

      for await (const [_idx, [_k, _v]] of test.in.slice(0, idx + 1).entries()) {
        if (test.in.slice(0, idx + 1).filter((i) => i[0] === _k).length > 1 && _v !== null) {
          // skip if value has been updated
          continue
        }
        const _value = typeof _v === 'string' ? utf8ToBytes(_v) : null
        const stored_v2 = await trie_v2.get(utf8ToBytes(_k!))
        t.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(rootHashv1, test.root, 'root hash v1 should match test root')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    t.equal(rootHashv2, test.root, 'root hash v2 should match test root')
    t.end()
  })
  _tape.test('branch-value-update', async (t) => {
    const test = trietest['branch-value-update']
    t.pass(`${test.in}`)
    const trie_v2 = new TrieWrap()
    const trie_v1 = new Trie()
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    for await (const [idx, [k, v]] of test.in.entries()) {
      const key = utf8ToBytes(k!)
      const value = typeof v === 'string' ? utf8ToBytes(v) : null
      const value_v1 = v !== null ? utf8ToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      t.deepEqual(v2_root, v1_root, 'v2 new root hash should match v1')

      for await (const [_idx, [_k, _v]] of test.in.slice(0, idx + 1).entries()) {
        if (test.in.slice(0, idx + 1).filter((i) => i[0] === _k).length > 1) {
          const changed = test.in
            .slice(0, idx + 1)
            .filter((i) => i[0] === _k)
            .slice(-1)[0]

          const _value = typeof changed[1] === 'string' ? utf8ToBytes(changed[1]) : null
          const stored_v2 = await trie_v2.get(utf8ToBytes(_k!))
          console.log({
            changed,
            key: utf8ToBytes(changed[0]),
            val: utf8ToBytes(changed[1]),
          })
          t.deepEqual(
            stored_v2,
            _value,
            `v2 should retrieve key/value: ${changed[0]} / ${changed[1]}`
          )
        } else {
          const _value = typeof _v === 'string' ? utf8ToBytes(_v) : null
          const stored_v2 = await trie_v2.get(utf8ToBytes(_k!))
          t.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
        }
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(rootHashv1, test.root, 'root hash v1 should match test root')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    t.equal(rootHashv2, test.root, 'root hash v2 should match test root')
    t.end()
  })
  _tape.end()
})
tape('hex_encoded_securetrie_test.json', async (_tape) => {
  _tape.test('emptyValues', async (t) => {
    const test = securetest.emptyValues
    t.pass(`${test.in}`)
    const trie_v2 = new TrieWrap(undefined, true)
    const trie_v1 = new Trie({ useKeyHashing: true })
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    const toTest: Map<string | null, string | null> = new Map()
    for await (const [idx, [k, v]] of test.in.entries()) {
      const key = utf8ToBytes(k!)
      const value = typeof v === 'string' ? utf8ToBytes(v) : null
      const value_v1 = v !== null ? utf8ToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      toTest.set(k, v)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      t.deepEqual(v2_root, v1_root, `${idx}: root hash should match`)
      for await (const [_k, _v] of toTest.entries()) {
        const _value = typeof _v === 'string' ? utf8ToBytes(_v) : null
        const stored_v2 = await trie_v2.get(utf8ToBytes(_k!))
        t.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(rootHashv1, test.root, 'root hash v1 should match')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    t.equal(rootHashv2, test.root, 'root hash v2 should match')
    t.end()
  })
  _tape.test('branchingTests', async (t) => {
    const test = securetest.branchingTests
    t.pass(`${test.in}`)
    const trie_v2 = new TrieWrap(undefined, true)
    const trie_v1 = new Trie({ useKeyHashing: true })
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    for await (const [idx, [k, v]] of test.in.entries()) {
      const key = hexStringToBytes(k!)
      const value = typeof v === 'string' ? utf8ToBytes(v) : null
      const value_v1 = v !== null ? utf8ToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      t.deepEqual(v2_root, v1_root, 'v2 new root hash should match v1')
      for await (const [_idx, [_k, _v]] of test.in.slice(0, idx + 1).entries()) {
        if (test.in.slice(0, idx + 1).filter((i) => i[0] === _k).length > 1 && _v !== null) {
          // skip if value has been updated
          continue
        }
        const _value = typeof _v === 'string' ? utf8ToBytes(_v) : null
        const stored_v2 = await trie_v2.get(hexStringToBytes(_k!))
        t.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(rootHashv1, test.root, 'root hash v1 should match test root')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    t.equal(rootHashv2, test.root, 'root hash v2 should match test root')
    t.end()
  })
  _tape.test('jeff', async (t) => {
    const test = securetest.jeff
    t.pass(`${test.in}`)
    const trie_v2 = new TrieWrap(undefined, true)
    const trie_v1 = new Trie({ useKeyHashing: true })
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    for await (const [idx, [k, v]] of test.in.entries()) {
      const key = hexStringToBytes(k!)
      const value = typeof v === 'string' ? hexStringToBytes(v) : null
      const value_v1 = v !== null ? hexStringToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      t.deepEqual(v2_root, v1_root, 'v2 new root hash should match v1')

      for await (const [_idx, [_k, _v]] of test.in.slice(0, idx + 1).entries()) {
        if (test.in.slice(0, idx + 1).filter((i) => i[0] === _k).length > 1 && _v !== null) {
          // skip if value has been updated
          continue
        }
        const _value = typeof _v === 'string' ? hexStringToBytes(_v) : null
        const stored_v2 = await trie_v2.get(hexStringToBytes(_k!))
        t.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    t.equal(rootHashv1, test.root, 'root hash v1 should match test root')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    t.equal(rootHashv2, test.root, 'root hash v2 should match test root')
    t.end()
  })
  _tape.end()
})
tape('securetrie', async (t) => {
  t.test('1', async (st) => {
    const test = hexencoded.test1
    const test_in = Object.entries(test.in)
    st.pass(`${test.in}`)
    const trie_v2 = new TrieWrap(undefined, true)
    const trie_v1 = new Trie({ useKeyHashing: true })
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    st.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    for await (const [idx, [k, v]] of test_in.entries()) {
      const key = hexStringToBytes(k!)
      const value = typeof v === 'string' ? hexStringToBytes(v) : null
      const value_v1 = v !== null ? hexStringToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      st.deepEqual(v2_root, v1_root, 'v2 new root hash should match v1')
      for await (const [_idx, [_k, _v]] of test_in.slice(0, idx + 1).entries()) {
        if (test_in.slice(0, idx + 1).filter((i) => i[0] === _k).length > 1 && _v !== null) {
          // skip if value has been updated
          continue
        }
        const _value = typeof _v === 'string' ? hexStringToBytes(_v) : null
        const stored_v2 = await trie_v2.get(hexStringToBytes(_k!))
        st.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    st.equal(rootHashv1, test.root, 'root hash v1 should match test root')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    st.equal(rootHashv2, test.root, 'root hash v2 should match test root')
    st.end()
  })
  t.test('2', async (st) => {
    const test = hexencoded.test2
    const test_in = Object.entries(test.in)
    st.pass(`${test.in}`)
    const trie_v2 = new TrieWrap(undefined, true)
    const trie_v1 = new Trie({ useKeyHashing: true })
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    st.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    for await (const [idx, [k, v]] of test_in.entries()) {
      const key = hexStringToBytes(k!)
      const value = typeof v === 'string' ? hexStringToBytes(v) : null
      const value_v1 = v !== null ? hexStringToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      st.deepEqual(v2_root, v1_root, 'v2 new root hash should match v1')
      for await (const [_idx, [_k, _v]] of test_in.slice(0, idx + 1).entries()) {
        if (test_in.slice(0, idx + 1).filter((i) => i[0] === _k).length > 1 && _v !== null) {
          // skip if value has been updated
          continue
        }
        const _value = typeof _v === 'string' ? hexStringToBytes(_v) : null
        const stored_v2 = await trie_v2.get(hexStringToBytes(_k!))
        st.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    st.equal(rootHashv1, test.root, 'root hash v1 should match test root')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    st.equal(rootHashv2, test.root, 'root hash v2 should match test root')
    st.end()
  })
  t.test('3', async (st) => {
    const test = hexencoded.test3
    const test_in = Object.entries(test.in)
    st.pass(`${test.in}`)
    const trie_v2 = new TrieWrap(undefined, true)
    const trie_v1 = new Trie({ useKeyHashing: true })
    const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
    st.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
    for await (const [idx, [k, v]] of test_in.entries()) {
      const key = hexStringToBytes(k!)
      const value = typeof v === 'string' ? hexStringToBytes(v) : null
      const value_v1 = v !== null ? hexStringToBytes(v) : Uint8Array.from([])
      await trie_v1.put(key, value_v1)
      await trie_v2.insert(key, value)
      const v1_root = trie_v1.root()
      const v2_root = trie_v2.getRootHash()
      st.deepEqual(v2_root, v1_root, 'v2 new root hash should match v1')
      for await (const [_idx, [_k, _v]] of test_in.slice(0, idx + 1).entries()) {
        if (test_in.slice(0, idx + 1).filter((i) => i[0] === _k).length > 1 && _v !== null) {
          // skip if value has been updated
          continue
        }
        const _value = typeof _v === 'string' ? hexStringToBytes(_v) : null
        const stored_v2 = await trie_v2.get(hexStringToBytes(_k!))
        st.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
      }
    }
    const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
    st.equal(rootHashv1, test.root, 'root hash v1 should match test root')
    const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
    st.equal(rootHashv2, test.root, 'root hash v2 should match test root')
    st.end()
  })
  t.end()
})
const serializer = (value: string, hex: boolean = false): Uint8Array => {
  return hex ? hexStringToBytes(value) : utf8ToBytes(value)
}
tape('secure_anyOrder', async (t) => {
  for (const _test of Object.keys(secure_anyOrder)) {
    const hex = _test === 'hex'
    t.test(`${_test}`, async (st) => {
      const test = secure_anyOrder[_test as keyof typeof secure_anyOrder]
      const test_in = Object.entries(test.in)
      const trie_v2 = new TrieWrap(undefined, true)
      const trie_v1 = new Trie({ useKeyHashing: true })
      const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
      const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
      st.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
      const toTest: Map<string | null, string | null> = new Map()
      for await (const [idx, [k, v]] of test_in.entries()) {
        const key = serializer(k!, hex)
        const value = typeof v === 'string' ? serializer(v, hex) : null
        const value_v1 = v !== null ? serializer(v, hex) : Uint8Array.from([])
        await trie_v1.put(key, value_v1)
        await trie_v2.insert(key, value)
        toTest.set(k, v)
        const v1_root = trie_v1.root()
        const v2_root = trie_v2.getRootHash()
        st.deepEqual(v2_root, v1_root, `${idx}: root hash should match`)
        for await (const [_k, _v] of toTest.entries()) {
          const _value = typeof _v === 'string' ? serializer(_v, hex) : null
          const stored_v2 = await trie_v2.get(serializer(_k!, hex))
          st.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
        }
      }
      const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
      st.equal(rootHashv1, test.root, 'root hash v1 should match')
      const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
      st.equal(rootHashv2, test.root, 'root hash v2 should match')
      st.end()
    })
  }
  t.end()
})
tape('anyOrder', async (t) => {
  for (const _test of Object.keys(trieanyorder)) {
    const hex = _test === 'hex'
    t.test(`${_test}`, async (st) => {
      const test = trieanyorder[_test as keyof typeof trieanyorder]
      const test_in = Object.entries(test.in)
      const trie_v2 = new TrieWrap()
      const trie_v1 = new Trie()
      const emptyRoot_v2 = bytesToPrefixedHexString(trie_v2.getRootHash())
      const emptyRoot_v1 = bytesToPrefixedHexString(trie_v1.root())
      st.equal(emptyRoot_v2, emptyRoot_v1, 'empty root hash should match')
      const toTest: Map<string | null, string | null> = new Map()
      for await (const [idx, [k, v]] of test_in.entries()) {
        const key = serializer(k!, hex)
        const value = typeof v === 'string' ? serializer(v, hex) : null
        const value_v1 = v !== null ? serializer(v, hex) : Uint8Array.from([])
        await trie_v1.put(key, value_v1)
        await trie_v2.insert(key, value)
        toTest.set(k, v)
        const v1_root = trie_v1.root()
        const v2_root = trie_v2.getRootHash()
        st.deepEqual(v2_root, v1_root, `${idx}: root hash should match`)
        if (!equalsBytes(v2_root, v1_root)) {
          const v1 = (await trie_v1.lookupNode(v1_root))!
          const v2 = trie_v2.getRoot()
          console.log('type', v2.getType())
          console.log('v1', v1.raw())
          console.log('v2', v2.raw())
          console.log('v2_child', v2.getChild(0)!.hash())
        }
        for await (const [_k, _v] of toTest.entries()) {
          const _value = typeof _v === 'string' ? serializer(_v, hex) : null
          const stored_v2 = await trie_v2.get(serializer(_k!, hex))
          st.deepEqual(stored_v2, _value, `v2 should retrieve key/value: ${_k} / ${_v}`)
        }
      }
      const rootHashv1 = bytesToPrefixedHexString(trie_v1.root())
      st.equal(rootHashv1, test.root, 'root hash v1 should match')
      const rootHashv2 = bytesToPrefixedHexString(trie_v2.getRootHash())
      st.equal(rootHashv2, test.root, 'root hash v2 should match')
      st.end()
    })
  }
  t.end()
})
