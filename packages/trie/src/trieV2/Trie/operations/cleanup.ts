import { debug as _debug } from 'debug'

import { BranchNode, ExtensionNode, LeafNode, NullNode } from '../../Node'

import type { TNode } from '../../types'
import type { Debugger } from 'debug'
import type { EventEmitter } from 'events'

export async function _cleanupNode(
  node: TNode,
  debug?: Debugger,
  event?: EventEmitter
): Promise<TNode> {
  debug = debug ? debug.extend('_cleanupNode') : _debug(`_cleanupNode`)
  debug(`Cleaning up ${node.getType()}: ${node.getPartialKey()}`)
  if (node instanceof BranchNode) {
    debug = debug.extend('BranchNode')
    if (node.childNodes().size === 0) {
      debug(`Branch node has no children, converting to LeafNode`)
      const newNode = new LeafNode({
        key: node.keyNibbles,
        value: node.value,
      })
      event?.emit('nodeAdded', newNode)
      return newNode
    }
    if (node.childNodes().size === 1 && node.value === null) {
      const c = node.childNodes().entries().next().value
      debug(`Branch node has only one child, replacing with child: ${c[0]}: ${c[1].getType()}`)
      const [idx, _child] = c as [number, TNode]
      debug(`updating key of child [${idx}] + [${_child.getPartialKey()}]`)
      const updated = await _child.updateKey([idx, ..._child.getPartialKey()])
      const newNode = _cleanupNode(updated)
      event?.emit('nodeAdded', newNode)
      return newNode
    } else {
      debug(`Branch node has ${node.childNodes().size} children, returning`)
      return node
    }
  } else if (node instanceof ExtensionNode) {
    debug = debug.extend('ExtensionNode')
    const child = node.child
    if (child instanceof LeafNode) {
      debug(`child is a LeafNode.  replacing ExtensionNode with LeafNode`)
      debug(`concat parent+child key: [${node.getPartialKey()}] + [${child.getPartialKey()}]`)
      const newNode = new LeafNode({
        key: [...node.getPartialKey(), ...child.getPartialKey()],
        value: child.value,
      })
      event?.emit('nodeAdded', newNode)
      return newNode
    } else if (child instanceof ExtensionNode) {
      debug(`child is an ExtensionNode, compressing into parent`)
      debug(`concat parent+child key: [${node.getPartialKey()}] + [${child.getPartialKey()}]`)
      const subNode = await _cleanupNode(child.child, debug)
      event?.emit('nodeAdded', subNode)
      const compressed = new ExtensionNode({
        keyNibbles: [...node.getPartialKey(), ...child.getPartialKey()],
        subNode,
      })
      const newNode = _cleanupNode(compressed, debug)
      event?.emit('nodeAdded', newNode)
      return newNode
    } else if (child instanceof BranchNode && child.value === null) {
      if (child.childNodes().size === 1) {
        debug(`child is BrancNode with 1 child.  compressing nodes.`)
        const [k, childNode] = child.childNodes().entries().next().value
        const subNode = await _cleanupNode(childNode, debug)
        if (subNode instanceof LeafNode) {
          debug(`child is LeafNode.  replacing ExtensionNode with LeafNode`)
          debug(
            `concat parent+branch+child key: [${[
              ...node.getPartialKey(),
              k,
              ...subNode.getPartialKey(),
            ]}]`
          )
          const newNode = new LeafNode({
            key: [...node.getPartialKey(), k, ...subNode.getPartialKey()],
            value: subNode.value,
          })
          event?.emit('nodeAdded', newNode)
          return newNode
        }
        const extension = new ExtensionNode({
          keyNibbles: node.getPartialKey(),
          subNode,
        })
        const newNode = _cleanupNode(extension, debug)
        event?.emit('nodeAdded', newNode)
        event?.emit('nodeAdded', subNode)
        return newNode
      } else if (child.childNodes().size === 0 && child.value === null) {
        debug(`Child is a branch node with no children and no value, converting to NullNode`)
        return new NullNode()
      } else {
        debug(`Child is a branch node with more than one child, returning`)
        return node
      }
    }
  }

  // If the node is not a branch node, or it's a branch node with more than
  // one child, there's nothing to clean up and we return the node as is.
  return node
}
