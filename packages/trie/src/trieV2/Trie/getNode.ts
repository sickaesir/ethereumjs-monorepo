import { bytesToPrefixedHexString } from '@ethereumjs/util'

import { NullNode } from '../Node'
import { decodeNibbles, nibblesEqual } from '../util'

import type { BranchNode, ExtensionNode, LeafNode } from '../Node'
import type { TNode } from '../types'
import type { WalkResult } from '../util'
import type { Debugger } from 'debug'

export async function _getNode(root: TNode, key: Uint8Array, debug: Debugger): Promise<WalkResult> {
  debug = debug.extend('_getNode')
  debug(`getting node with key: ${bytesToPrefixedHexString(key)}`)
  const keyNibbles = decodeNibbles(key)
  let currentNode: TNode = root
  debug(`Starting at (root): ${currentNode.getType()} [${currentNode.getPartialKey()}]`)
  debug(`Searching for: ${keyNibbles}`)
  const path = []
  let nibbleIndex = 0
  while (currentNode.type !== 'NullNode') {
    debug.extend(currentNode.getType())(`Pushing node to path`)
    path.push(currentNode)
    let childIndex: number | undefined
    let childNode: TNode | undefined
    let sharedNibbles: number[]
    let keySharedNibbles: number[]
    switch (currentNode.type) {
      case 'BranchNode':
        childIndex = keyNibbles[nibbleIndex]
        if (childIndex === undefined) {
          debug.extend(currentNode.getType())(`Child index is undefined, returning`)
          return { node: currentNode as BranchNode, path, remainingNibbles: [] }
        }
        debug.extend(currentNode.getType())(
          `Searching for child at index ${keyNibbles[nibbleIndex]}`
        )
        childNode = (currentNode as BranchNode).getChild(childIndex)
        debug.extend(currentNode.getType())(
          `Found ${childNode?.getType()}: ${childNode?.getPartialKey()} at index ${childIndex}`
        )
        if (childNode) {
          nibbleIndex++
          currentNode = childNode
        } else {
          debug.extend(currentNode.getType())(`Child not found, returning`)
          return { node: currentNode, path, remainingNibbles: keyNibbles.slice(nibbleIndex) }
        }

        break
      case 'ExtensionNode':
        sharedNibbles = (currentNode as ExtensionNode).getPartialKey()
        keySharedNibbles = keyNibbles.slice(nibbleIndex, nibbleIndex + sharedNibbles.length)
        debug.extend(currentNode.getType())(`Shared nibbles: ${sharedNibbles}`)
        if (nibblesEqual(sharedNibbles, keySharedNibbles)) {
          debug.extend(currentNode.getType())(`Shared nibbles match entirely.`)
          nibbleIndex += sharedNibbles.length
          if (nibbleIndex === keyNibbles.length) {
            debug.extend(currentNode.getType())(`Reached end of key.`)
            return { node: currentNode.child, path, remainingNibbles: [] }
          }
          currentNode = (currentNode as ExtensionNode).child
        } else {
          debug.extend(currentNode.getType())(`Shared nibbles do not match.`)
          return { node: new NullNode(), path, remainingNibbles: keyNibbles.slice(nibbleIndex) }
        }
        break
      case 'LeafNode':
        if (
          nibblesEqual(keyNibbles.slice(nibbleIndex), (currentNode as LeafNode).getPartialKey())
        ) {
          debug.extend(currentNode.getType())(`Nibbles Match`)
          return { node: currentNode as LeafNode, path, remainingNibbles: [] }
        } else {
          debug.extend(currentNode.getType())(`Nibbles Do Not Match`)
          return { node: new NullNode(), path, remainingNibbles: keyNibbles.slice(nibbleIndex) }
        }
    }
    debug(`CurrentNode: ${currentNode.getType()}: ${currentNode.getPartialKey()}`)
  }
  debug(`Returning NullNode`)
  return {
    node: new NullNode(),
    path,
    remainingNibbles: keyNibbles.slice(nibbleIndex),
  }
}
