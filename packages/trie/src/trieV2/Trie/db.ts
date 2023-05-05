import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { Level } from 'level'

import type { Debugger } from 'debug'

type DBValue = Uint8Array | null

interface Idb {
  get(key: Uint8Array): Promise<DBValue>
  put(value: DBValue): Promise<Uint8Array>
  del(key: Uint8Array): Promise<void>
  batch(items: { type: 'put' | 'del'; key: Uint8Array; value?: Uint8Array }[]): Promise<void>
}

export class Database implements Idb {
  private readonly db: Level<Uint8Array, Uint8Array>
  private readonly log: Debugger

  constructor(path: string) {
    this.db = new Level(path)
    this.log = debug('trie:db')
  }

  async get(key: Uint8Array): Promise<Uint8Array | null> {
    try {
      const value = await this.db.get(key)
      return value
    } catch (error: any) {
      if (error.type === 'NotFoundError') {
        return null
      }
      throw error
    }
  }

  async del(key: Uint8Array): Promise<void> {
    await this.db.del(key)
  }

  async put(value: Uint8Array): Promise<Uint8Array> {
    const key = keccak256(value)
    await this.db.put(key, value)
    return key
  }

  async batch(
    operations: { type: 'put' | 'del'; key: Uint8Array; value?: Uint8Array }[]
  ): Promise<void> {
    const batch = this.db.batch()
    for (const op of operations) {
      if (op.type === 'put' && op.value) {
        batch.put(op.key, op.value)
      } else {
        batch.del(op.key)
      }
    }
    await batch.write()
  }

  async close(): Promise<void> {
    await this.db.close()
  }
}
