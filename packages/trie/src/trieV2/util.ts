import { bytesToHex } from 'ethereum-cryptography/utils'

import type { Nibble } from './types'

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
export function matchingNibbleLength(nib1: Nibble[], nib2: Nibble[]): number {
  let i = 0
  while (nib1[i] === nib2[i] && nib1.length > i) {
    i++
  }
  return i
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
export function encodeNibbles(_nibbles: Nibble[]): Uint8Array {
  const nibbles = [..._nibbles]
  const length = nibbles.length
  const isOddLength = length % 2 === 1
  const encoded: number[] = []

  if (isOddLength) {
    nibbles.unshift(NIBBLE_PADDING)
  }

  for (let i = 0; i < nibbles.length; i += 2) {
    encoded.push((nibbles[i] << 4) | nibbles[i + 1])
  }

  return new Uint8Array(encoded)
}

export function decodeNibbles(encoded: Uint8Array): Nibble[] {
  const decoded: Nibble[] = []

  for (const byte of encoded) {
    decoded.push(byte >> 4, byte & 0x0f)
  }

  if (decoded[0] === NIBBLE_PADDING) {
    decoded.shift()
  }

  return decoded
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
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

export function addPadding(nibbles: Nibble[]): Nibble[] {
  const length = nibbles.length
  const isOddLength = length % 2 === 1

  if (isOddLength) {
    nibbles.unshift(NIBBLE_PADDING)
    return nibbles
  } else {
    return nibbles
  }
}
export function unPad(nibbles: Nibble[]): Nibble[] {
  if (nibbles[0] === NIBBLE_PADDING) {
    return nibbles.slice(1)
  } else {
    return nibbles
  }
}
