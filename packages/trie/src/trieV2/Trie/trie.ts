import type { TrieInterface } from './trieInterface'

export interface CreateTrieOptions {}
export class MerklePatriciaTrie implements TrieInterface {
  static async create(_options: CreateTrieOptions): Promise<MerklePatriciaTrie> {
    const trie = await MerklePatriciaTrie.create({})
    return trie
  }
  static async fromProof(_proof: Uint8Array[]): Promise<MerklePatriciaTrie> {
    const trie = await MerklePatriciaTrie.create({})
    return trie
  }
  static async fromMultiProof(_proof: Uint8Array[]): Promise<MerklePatriciaTrie> {
    const trie = await MerklePatriciaTrie.create({})
    return trie
  }
  static async verifyProof(_proof: Uint8Array[]): Promise<boolean> {
    return true
  }
  static async verifyMultiProof(_proof: Uint8Array[]): Promise<boolean> {
    return true
  }
}
