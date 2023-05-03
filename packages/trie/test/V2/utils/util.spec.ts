import tape from 'tape'

import {
  bytesToNibbles,
  concatNibbles,
  deduplicateNodes,
  doKeysMatch,
  firstNibble,
  matchingNibbleLength,
  nibblesCompare,
  nibblesToBytes,
} from '../../../src/trieV2/util.js'

tape('Trie Util Unit Tests', (t) => {
  t.test('bytesToNibbles', (st: tape.Test) => {
    const key = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    const nibbles = bytesToNibbles(key)
    st.deepEqual(nibbles, [0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7])
    st.deepEqual(bytesToNibbles(new Uint8Array([])), [])
    st.end()
  })
  t.test('nibblesToBytes', (st: tape.Test) => {
    const nibbles = [0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7]
    const key = nibblesToBytes(nibbles)
    st.deepEqual(key, new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))
    try {
      nibblesToBytes([1, 2, 3])
      st.fail('should throw')
    } catch (e: any) {
      st.equal(e.message, 'Nibbles must be even length')
    }
    st.end()
  })
  t.test('nibblesCompare', (st: tape.Test) => {
    st.equal(nibblesCompare([1, 2, 3], [1, 2, 3]), 0)
    st.equal(nibblesCompare([1, 2, 3], [1, 2, 4]), -1)
    st.equal(nibblesCompare([1, 2, 3], [1, 2, 2]), 1)
    st.equal(nibblesCompare([1, 2, 3], [1, 2, 3, 4]), -1)
    st.equal(nibblesCompare([1, 2, 3, 4], [1, 2, 3]), 1)
    st.equal(nibblesCompare([1, 2, 3, 4], [1, 2, 3, 4]), 0)
    st.end()
  })
  t.test('matchingNibbleLength', (st: tape.Test) => {
    st.equal(matchingNibbleLength([1, 2, 3], [1, 2, 3]), 3)
    st.equal(matchingNibbleLength([1, 2, 3], [1, 2, 4]), 2)
    st.equal(matchingNibbleLength([1, 2, 3], [1, 2, 2]), 2)
    st.equal(matchingNibbleLength([1, 2, 3], [1, 2, 3, 4]), 3)
    st.equal(matchingNibbleLength([1, 2, 3, 4], [1, 2, 3]), 3)
    st.end()
  })
  t.test('doKeysMatch', (st: tape.Test) => {
    st.equal(doKeysMatch([1, 2, 3], [1, 2, 3]), true)
    st.equal(doKeysMatch([1, 2, 3], [1, 2, 4]), false)
    st.equal(doKeysMatch([1, 2, 3], [1, 2, 2]), false)
    st.equal(doKeysMatch([1, 2, 3], [1, 2, 3, 4]), false)
    st.equal(doKeysMatch([1, 2, 3, 4], [1, 2, 3]), false)
    st.end()
  })
  t.test('deduplicateNodes', (st: tape.Test) => {
    const nodes = Array.from({ length: 3 }, (_, i) => new Uint8Array([i]))
    const array1 = [nodes[0], nodes[0], nodes[0]]
    const array2 = [nodes[0], nodes[1], nodes[0]]
    const array3 = [nodes[0], nodes[1], nodes[2]]
    const array4 = [nodes[0], nodes[1], nodes[2], nodes[0]]
    const array5 = [nodes[0], nodes[1], nodes[2], nodes[0], nodes[1]]
    const array6 = [nodes[1], nodes[2], nodes[0], nodes[1], nodes[2]]
    st.deepEqual(deduplicateNodes(array1), [nodes[0]])
    st.deepEqual(deduplicateNodes(array2), [nodes[0], nodes[1]])
    st.deepEqual(deduplicateNodes(array3), [nodes[0], nodes[1], nodes[2]])
    st.deepEqual(deduplicateNodes(array4), [nodes[0], nodes[1], nodes[2]])
    st.deepEqual(deduplicateNodes(array5), [nodes[0], nodes[1], nodes[2]])
    st.deepEqual(deduplicateNodes(array6), [nodes[1], nodes[2], nodes[0]])
    st.end()
  })
  t.test('firstNibble', (st: tape.Test) => {
    const key = Uint8Array.from([255, 0, 1, 2])
    st.equal(firstNibble(key), 15)
    st.end()
  })
  t.test('concatNibbles', (st: tape.Test) => {
    const nibblesA = [1, 2, 3]
    const nibblesB = [4, 5, 6]
    st.deepEqual(concatNibbles(nibblesA, nibblesB), [1, 2, 3, 4, 5, 6])
    st.end()
  })
  t.end()
})
