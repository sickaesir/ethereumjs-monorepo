import { Hardfork } from '@ethereumjs/common'
import { Address, RIPEMD160_ADDRESS_STRING, bytesToHex, stripHexPrefix } from '@ethereumjs/util'
import { debug as createDebugLogger } from 'debug'
import { hexToBytes } from 'ethereum-cryptography/utils'

import type { AccessList, Common, EVMStateManagerInterface } from '@ethereumjs/common'
import type { Account } from '@ethereumjs/util'
import type { Debugger } from 'debug'

enum AddressState {
  PreWarmUntouched,
  PreWarmTouched,
  Touched,
}

type WasPreWarm = boolean
type WarmSlots = Set<string>
type AddressString = string
type SlotString = string

type Journal = Map<AddressString, [WasPreWarm, WarmSlots]>

/**
 * Journal Diff Item:
 * If it is of type AddressString, delete the address from the journals
 * If it is an Array, then delete these storage slots from the journal (NOT the address)
 * TODO make it a set
 */

type JournalDiffItem = AddressString | [AddressString, SlotString]
type JournalHeight = number

export class EvmJournal {
  private stateManager: EVMStateManagerInterface
  private common: Common
  private DEBUG: boolean
  private _debug: Debugger

  private journal: Journal
  private touched: Set<string>
  private journalDiff: [JournalHeight, JournalDiffItem[]][]

  private journalHeight: number

  constructor(stateManager: EVMStateManagerInterface, common: Common) {
    // Skip DEBUG calls unless 'ethjs' included in environmental DEBUG variables
    this.DEBUG = process?.env?.DEBUG?.includes('ethjs') ?? false
    this._debug = createDebugLogger('statemanager:statemanager')

    this.journalHeight = 0
    this.journal = new Map()
    this.touched = new Set()
    this.journalDiff = []

    this.stateManager = stateManager
    this.common = common
  }

  async putAccount(address: Address, account: Account | undefined) {
    this.touchAddress(address)
    return this.stateManager.putAccount(address, account)
  }

  async deleteAccount(address: Address) {
    this.touchAddress(address)
    await this.stateManager.deleteAccount(address)
  }

  private touchAddress(address: Address): void {
    const str = address.toString().slice(2)
    this.touchAccount(str)
  }

  private touchAccount(address: string) {
    let added = false
    if (!this.touched.has(address)) {
      this.touched.add(address)
      added = true
    }
    if (!this.journal.has(address)) {
      this.journal.set(address, [false, new Set()])
      added = true
    }
    if (added) {
      const diffArr = this.journalDiff[this.journalDiff.length - 1][1]
      diffArr.push(address)
    }
  }
  async commit() {
    this.journalHeight--
    // TODO figure out if we cant just index the journal diff by the journalHeight index?
    // not sure, might not be possible:
    // Height: 1
    // Checkpoint
    // Height: 2 (A)
    // Commit
    // Height: 1
    // Checkpoint
    // Height: 2 (B)
    // Revert (now diff items of (B) are in same arr as (A) so (A) items also get reverted while those should be committed)
    this.journalDiff.push([this.journalHeight, []])
    await this.stateManager.commit()
  }

  async checkpoint() {
    this.journalHeight++
    this.journalDiff.push([this.journalHeight, []])
    await this.stateManager.checkpoint()
  }

  async revert() {
    // Loop backwards over the journal diff and stop if we are at a lower height than current journal height
    // During this process, delete all items.
    // TODO check this logic, if there is this array: height [4,3,4] and we revert height 4, then the final
    // diff arr will be reverted, but it will stop at height 3, so [4,3] are both not reverted..?
    let finalI: number
    for (let i = this.journalDiff.length - 1; i >= 0; i--) {
      finalI = i
      const [height, diff] = this.journalDiff[i]
      if (height < this.journalHeight) {
        break
      }

      for (const item of diff) {
        if (Array.isArray(item)) {
          const address = item[0]
          const slot = item[1]
          const slotsMap = this.journal.get(address)![1]
          slotsMap.delete(slot)
        } else {
          // It is a string, so we have to delete it from touched accounts and warm addresses
          // NOTE: only delete from warm addresses if it is not pre-warmed
          const address = <string>item
          if (address !== RIPEMD160_ADDRESS_STRING) {
            // If RIPEMD160 is touched, keep it touched.
            // Default behavior for others.
            this.touched.delete(address)
          }

          // Sanity check, journal should have the item
          if (this.journal.has(address)) {
            if (!this.journal.get(address)![0]) {
              // It was not pre-warm, so now mark this address as cold
            }
          }
        }
      }
    }

    // the final diffs are reverted and we can dispose those
    this.journalDiff = this.journalDiff.slice(0, finalI!)

    this.journalHeight--

    await this.stateManager.revert()
  }

  /**
   * Removes accounts form the state trie that have been touched,
   * as defined in EIP-161 (https://eips.ethereum.org/EIPS/eip-161).
   * Also cleanups any other internal fields
   */
  async cleanup(): Promise<void> {
    if (this.common.gteHardfork(Hardfork.SpuriousDragon) === true) {
      const touchedArray = Array.from(this.touched)
      for (const [addressHex] of touchedArray) {
        const address = new Address(hexToBytes(addressHex))
        const empty = await this.stateManager.accountIsEmptyOrNonExistent(address)
        if (empty) {
          await this.deleteAccount(address)
          if (this.DEBUG) {
            this._debug(`Cleanup touched account address=${address} (>= SpuriousDragon)`)
          }
        }
      }
    }
    this.journalHeight = 0
    this.journal = new Map()
    this.touched = new Set()
    this.journalDiff = []
  }

  /**
   * Adds pre-warmed addresses and slots to the warm addresses list
   * @param accessList The access list provided by the tx
   * @param extras Any extra addressess which should be warmed as well (precompiles, sender, receipient, coinbase (EIP 3651))
   */
  addPreWarmed(accessList: AccessList, extras: string[]) {
    for (const entry of accessList) {
      const address = stripHexPrefix(entry.address)
      if (!this.journal.has(address)) {
        this.journal.set(address, [true, new Set()]) // Mark as prewarmed (true) so it never gets cold
      }
      const set = this.journal.get(address)![1]
      for (const slots of entry.storageKeys) {
        set.add(stripHexPrefix(slots))
      }
    }
    for (const addressMaybePrefixed of extras) {
      const address = stripHexPrefix(addressMaybePrefixed)
      if (!this.journal.has(address)) {
        this.journal.set(address, [true, new Set()]) // Mark as prewarmed (true) so it never gets cold
      }
    }
  }

  /**
   * Returns true if the address is warm in the current context
   * @param address - The address (as a Uint8Array) to check
   */
  isWarmedAddress(address: Uint8Array): boolean {
    const addressHex = bytesToHex(address)
    return this.journal.has(addressHex)
  }

  /**
   * Add a warm address in the current context
   * @param address - The address (as a Uint8Array) to check
   */
  addWarmedAddress(address: Uint8Array): void {
    this.touchAccount(bytesToHex(address))
  }

  /**
   * Returns true if the slot of the address is warm
   * @param address - The address (as a Uint8Array) to check
   * @param slot - The slot (as a Uint8Array) to check
   */
  isWarmedStorage(address: Uint8Array, slot: Uint8Array): boolean {
    const addressHex = bytesToHex(address)
    const items = this.journal.get(addressHex)
    if (items === undefined) {
      return false
    }
    return items[1].has(bytesToHex(slot))
  }

  /**
   * Mark the storage slot in the address as warm in the current context
   * @param address - The address (as a Uint8Array) to check
   * @param slot - The slot (as a Uint8Array) to check
   */
  addWarmedStorage(address: Uint8Array, slot: Uint8Array): void {
    const addressHex = bytesToHex(address)
    let items = this.journal.get(addressHex)
    if (items === undefined) {
      this.addWarmedAddress(address)
      items = this.journal.get(addressHex)
    }
    const slots = items![1]
    const slotStr = bytesToHex(slot)
    if (!slots.has(slotStr)) {
      slots.add(slotStr)
      const diff = this.journalDiff[this.journalDiff.length - 1][1]
      // Note: move this to a set to avoid adding a load of array items, should just loop over the set
      // So diff should probably be of type [Set<AddressString>, Map<AddressString, Set<SlotString>>]
      // So you can loop over the addresses to be deleted, and loop over the slots per address to be deleted.
      // For now this should work
      diff.push([addressHex, slotStr])
    }
  }
}
