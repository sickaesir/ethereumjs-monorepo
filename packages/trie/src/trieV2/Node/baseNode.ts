import debug from 'debug'
import { keccak256 } from 'ethereum-cryptography/keccak'

import type { HashFunction } from '../types'
import type { Debugger } from 'debug'

export abstract class BaseNode {
  debug: Debugger
  hashFunction: HashFunction
  constructor(args: any) {
    this.debug = debug(this.constructor.name)
    this.hashFunction = args.hashFunction ?? keccak256
    this.debug('hey ')
  }
}
