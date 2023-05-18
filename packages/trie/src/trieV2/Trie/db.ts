import { hexStringToBytes } from '@ethereumjs/util'
import { debug as _debug } from 'debug'
import { bytesToHex } from 'ethereum-cryptography/utils'
import { MemoryLevel } from 'memory-level'

import type { Debugger } from 'debug'
import type { Level } from 'level'

type DBValue = Uint8Array | null

interface Idb {
  open(): Promise<void>
  get(key: Uint8Array): Promise<DBValue>
  put(key: Uint8Array, value: DBValue): Promise<Uint8Array>
  del(key: Uint8Array): Promise<void>
  batch(items: { type: 'put' | 'del'; key: Uint8Array; value?: Uint8Array }[]): Promise<void>
}

export class Database implements Idb {
  static async createAndOpen(
    options: {
      db?: MemoryLevel<string, string>
      debug?: Debugger
    } = {}
  ): Promise<Database> {
    const db = new Database(options)
    await db.db.open()
    return db
  }
  private readonly db: MemoryLevel<string, string>
  private readonly log: Debugger

  constructor(options: { db?: MemoryLevel<string, string>; debug?: Debugger } = {}) {
    this.db = options.db ?? (new MemoryLevel({}) as Level<string, string>)
    this.log = options.debug ? options.debug.extend('db') : _debug('trie:db')
  }

  async open(): Promise<void> {
    await this.db.open()
    this.log('DB opened')
  }
  async keys(): Promise<Uint8Array[]> {
    const keys = []
    for await (const key of this.db.keys()) {
      keys.push(hexStringToBytes(key))
    }
    return keys
  }
  async get(key: Uint8Array): Promise<Uint8Array | null> {
    this.log.extend('get')(bytesToHex(key))
    try {
      const value = await this.db.get(bytesToHex(key))
      return hexStringToBytes(value)
    } catch (error: any) {
      return null
    }
  }

  async del(key: Uint8Array): Promise<void> {
    this.log.extend('del')(bytesToHex(key))
    await this.db.del(bytesToHex(key))
  }

  async put(key: Uint8Array, value: Uint8Array): Promise<Uint8Array> {
    this.log.extend('put')(bytesToHex(key))
    await this.db.put(bytesToHex(key), bytesToHex(value))
    return key
  }

  async batch(
    operations: { type: 'put' | 'del'; key: Uint8Array; value?: Uint8Array }[]
  ): Promise<void> {
    this.log.extend('batch')(Object.fromEntries(operations.map((op) => op.type).entries()))
    const batch = this.db.batch()
    for (const op of operations) {
      if (op.type === 'put' && op.value) {
        batch.put(bytesToHex(op.key), bytesToHex(op.value))
      } else {
        batch.del(bytesToHex(op.key))
      }
    }
    await batch.write()
  }

  async close(): Promise<void> {
    await this.db.close()
    this.log('DB closed')
  }
}
