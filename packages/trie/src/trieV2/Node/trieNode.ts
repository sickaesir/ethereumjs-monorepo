import { RLP } from '@ethereumjs/rlp'
import debug from 'debug'
import { equalsBytes } from 'ethereum-cryptography/utils'

import { decodeNibbles, keyToNibbles } from '..'

import { BranchNode, ExtensionNode, LeafNode, NullNode } from './index'

import type { NodeFromOptions, NodeType, TNode, TOpts } from '..'
import type { Debugger } from 'debug'

export class TrieNode {
  static async create<T extends TOpts>(options: T): Promise<NodeFromOptions<T>> {
    let node: NodeFromOptions<T>
    if ('key' in options && 'value' in options) {
      node = new LeafNode(options) as NodeFromOptions<T>
    } else if ('children' in options && 'value' in options) {
      node = new BranchNode(options) as NodeFromOptions<T>
    } else if ('keyNibbles' in options && 'subNode' in options) {
      node = new ExtensionNode(options) as NodeFromOptions<T>
    } else {
      throw new Error(`Unknown node type: ${Object.keys(options)}`)
    }
    return node
  }
  static async decodeToNode(
    encoded: Uint8Array,
    d_bug: Debugger = debug('Trie:decodeToNode')
  ): Promise<TNode> {
    d_bug(`encoded=${encoded}`)
    if (equalsBytes(encoded, RLP.encode(Uint8Array.from([])))) {
      d_bug(`node=NullNode`)
      return new NullNode()
    } else {
      const raw = RLP.decode(encoded)
      const type = TrieNode._type(encoded as any)
      d_bug(`encoded=${encoded.length} type=${type} raw=${raw.length}`)
      // TODO: refactor from switch to map
      switch (type) {
        case 'LeafNode': {
          const [key, value] = raw
          d_bug.extend('LeafNode')(`key=${key}, value=${value}`)
          return TrieNode.create({
            key: decodeNibbles(key as Uint8Array),
            value: value as Uint8Array,
          })
        }
        case 'BranchNode': {
          const value = raw[16] as Uint8Array
          const branches = raw.slice(0, 16)
          d_bug.extend('BranchNode')(`branches=${branches.length}, value=${value}`)
          const children: TNode[] = []
          for (let i = 0; i < raw.length; i++) {
            const branch = raw[i] as Uint8Array
            if (branch.length > 1) {
              const node = await TrieNode.decodeToNode(branch, d_bug)
              children.push(node)
            }
          }
          return TrieNode.create({
            children,
            value: value.length > 0 ? value : null,
          })
        }
        case 'ExtensionNode': {
          const [key, subNodeRlp] = raw
          debug(`TrieNode.decodeToNode`).extend('ExtensionNode')(
            `key=${key}, subNodeRlp=${subNodeRlp}`
          )
          const subNode = await TrieNode.decodeToNode(subNodeRlp as Uint8Array)
          return TrieNode.create({ keyNibbles: keyToNibbles(key as Uint8Array), subNode })
        }
        default:
          throw new Error(`Unknown node type: ${type}`)
      }
    }
  }
  static _rlpDecode(encoded: Uint8Array): Uint8Array[] {
    return RLP.decode(encoded) as Uint8Array[]
  }
  static _type(encoded: Uint8Array[]): NodeType {
    const raw = RLP.decode(encoded) as Uint8Array[]
    const type =
      raw.length === 17
        ? 'BranchNode'
        : raw.length === 2 && keyToNibbles(encoded as any)[0] > 0
        ? 'LeafNode'
        : raw.length === 2
        ? 'ExtensionNode'
        : undefined
    if (!type) {
      throw new Error(`Unknown node type with ${encoded.length} parts: ${type}`)
    }
    return type
  }
}
