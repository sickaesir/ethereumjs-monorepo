import { bytesToHex } from 'ethereum-cryptography/utils'

import type { Nibble, TNode } from './types'

/**
 * Converts a bytes to a nibble array.
 * @private
 * @param key
 */
export function bytesToNibbles(key: Uint8Array): Nibble[] {
  if (key.length === 0) {
    return []
  }
  const nibbles: Nibble[] = []
  for (let i = 0; i < key.length; i++) {
    let q = i * 2
    // Shift right 4 bits to get high nibble.
    nibbles[q] = key[i] >> 4
    // Mask with 00001111 to get low nibble.
    ++q
    nibbles[q] = key[i] % 16
  }
  return nibbles
}

/**
 * Converts a nibble array into bytes.
 * @private
 * @param arr - Nibble array
 */
export function nibblesToBytes(arr: Nibble[]): Uint8Array {
  if (arr.length % 2 !== 0) {
    throw new Error('Nibbles must be even length')
  }
  const buf = new Uint8Array(arr.length / 2)
  for (let i = 0; i < buf.length; i++) {
    let q = i * 2
    buf[i] = (arr[q] << 4) + arr[++q]
  }
  return buf
}

/**
 * Compare two nibble array.
 * * `0` is returned if `n2` === `n1`.
 * * `1` is returned if `n2` > `n1`.
 * * `-1` is returned if `n2` < `n1`.
 * @param n1 - Nibble array
 * @param n2 - Nibble array
 */
export function nibblesCompare(n1: Nibble[], n2: Nibble[]) {
  const cmpLength = Math.min(n1.length, n2.length)
  let res = 0
  for (let i = 0; i < cmpLength; i++) {
    if (n1[i] < n2[i]) {
      res = -1
      break
    } else if (n1[i] > n2[i]) {
      res = 1
      break
    }
  }
  if (res === 0) {
    if (n1.length < n2.length) {
      res = -1
    } else if (n1.length > n2.length) {
      res = 1
    }
  }
  return res
}

/**
 * Returns the number of in order matching nibbles of two give nibble arrays.
 * @private
 * @param nib1
 * @param nib2
 */
// export function matchingNibbleLength(nib1: Nibble[], nib2: Nibble[]): number {
//   let i = 0
//   while (nib1[i] === nib2[i] && nib1.length > i) {
//     i++
//   }
//   return i
// }
export function matchingNibbleLength(a: Nibble[], b: Nibble[]): number {
  const maxLength = Math.min(a.length, b.length)
  let position = 0
  while (position < maxLength && a[position] === b[position]) {
    position++
  }
  return position
}

/**
 * Compare two nibble array keys.
 * @param keyA
 * @param keyB
 */
export function doKeysMatch(keyA: Nibble[], keyB: Nibble[]): boolean {
  const length = matchingNibbleLength(keyA, keyB)
  return length === keyA.length && length === keyB.length
}

export function deduplicateNodes(nodes: Uint8Array[]): Uint8Array[] {
  const uniqueNodes = new Map<string, Uint8Array>()
  for (const TrieNode of nodes) {
    const key = bytesToHex(TrieNode)
    if (!uniqueNodes.has(key)) {
      uniqueNodes.set(key, TrieNode)
    }
  }
  return Array.from(uniqueNodes.values())
}

export function firstNibble(key: Uint8Array): number {
  return key[0] >> 4
}
export function concatNibbles(a: number[], b: number[]): Nibble[] {
  return [...a, ...b]
}

export const NIBBLE_PADDING = 0x00
export const TERMINATOR = 0x10

export function isTerminator(nibble: Nibble): boolean {
  return nibble === TERMINATOR
}
export function stripTerminator(nibbles: Nibble[]): Nibble[] {
  if (isTerminator(nibbles[nibbles.length - 1])) {
    return nibbles.slice(0, -1)
  }
  return nibbles
}

export function encodeNibbles(nibbles: Nibble[]): Uint8Array {
  const isTerminator = nibbles[nibbles.length - 1] === TERMINATOR
  const hasTerminator = isTerminator ? 1 : 0
  const length = nibbles.length + hasTerminator
  const buf = new Uint8Array(Math.ceil(length / 2))
  for (let i = 0; i < length; i++) {
    const q = Math.floor(i / 2)
    if (i % 2 === 0) {
      buf[q] = (nibbles[i] << 4) | (hasTerminator && isTerminator ? 0x0f : 0)
    } else {
      buf[q] |= nibbles[i]
    }
  }
  return buf
}
export function nibblesToKey(nibbles: Nibble[]): Uint8Array {
  const strippedNibbles = stripTerminator(nibbles)
  return encodeNibbles(strippedNibbles)
}

export type WalkResult = {
  node: TNode
  remainingNibbles: number[]
}
export function removeNibbles(nibbles: number[], count: number): number[] {
  return nibbles.slice(count)
}
export function getSharedNibbles(nibbles1: number[], nibbles2: number[]): number[] {
  const sharedNibbles = []
  for (let i = 0; i < Math.min(nibbles1.length, nibbles2.length); i++) {
    if (nibbles1[i] !== nibbles2[i]) {
      break
    }
    sharedNibbles.push(nibbles1[i])
  }
  return sharedNibbles
}
export type CommonPrefixResult = {
  commonPrefix: number[]
  remainingNibbles1: number[]
  remainingNibbles2: number[]
}
export function findCommonPrefix(nibbles1: number[], nibbles2: number[]): CommonPrefixResult {
  const matching = matchingNibbleLength(nibbles1, nibbles2)
  return {
    commonPrefix: nibbles1.slice(0, matching),
    remainingNibbles1: nibbles1.slice(matching),
    remainingNibbles2: nibbles2.slice(matching),
  }
}

export function decodeNibbles(bytes: Uint8Array): Nibble[] {
  const nibbles = []
  for (const byte of bytes) {
    nibbles.push(byte >> 4)
    nibbles.push(byte & 0x0f)
  }
  return nibbles
}
export function keyToNibbles(key: Uint8Array): Nibble[] {
  const nibbles = decodeNibbles(key)
  return nibbles
}
export function hasMatchingNibbles(a: number[], b: number[]): boolean {
  const minLength = Math.min(a.length, b.length)

  for (let i = 0; i < minLength; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}
export function nibblesEqual(a: number[], b: number[]): boolean {
  return matchingNibbleLength(a, b) === a.length && a.length === b.length
}
// export function addPadding(nibbles: Nibble[]): Nibble[] {
//   const length = nibbles.length
//   const isOddLength = length % 2 === 1

//   if (isOddLength) {
//     nibbles.unshift(NIBBLE_PADDING)
//     return nibbles
//   } else {
//     return nibbles
//   }
// }
// export function unPad(nibbles: Nibble[]): Nibble[] {
//   if (nibbles[0] === NIBBLE_PADDING) {
//     return nibbles.slice(1)
//   } else {
//     return nibbles
//   }
// }
