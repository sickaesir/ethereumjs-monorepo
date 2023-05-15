import {
  bigIntToBytes,
  bytesToBigInt,
  bytesToHex,
  computeVersionedHash,
  concatBytesNoTypeCheck,
  kzg,
  setLengthLeft,
  short,
} from '@ethereumjs/util'

import { EvmErrorResult } from '../evm'
import { ERROR, EvmError } from '../exceptions'

import type { ExecResult } from '../evm'
import type { PrecompileInput } from './types'

export const BLS_MODULUS = BigInt(
  '52435875175126190479447740508185965837690552500527637822603658699938581184513'
)

export async function precompile14(opts: PrecompileInput): Promise<ExecResult> {
  const gasUsed = opts._common.param('gasPrices', 'kzgPointEvaluationGasPrecompilePrice')
  if (opts._debug !== undefined) {
    opts._debug(
      `Run KZG_POINT_EVALUATION (0x14) precompile data=${short(opts.data)} length=${
        opts.data.length
      } gasLimit=${opts.gasLimit} gasUsed=${gasUsed}`
    )
  }

  const version = Number(opts._common.paramByEIP('sharding', 'blobCommitmentVersionKzg', 4844))
  const fieldElementsPerBlob = opts._common.paramByEIP('sharding', 'fieldElementsPerBlob', 4844)!
  const versionedHash = opts.data.subarray(0, 32)
  const z = opts.data.subarray(32, 64)
  const y = opts.data.subarray(64, 96)
  const commitment = opts.data.subarray(96, 144)
  const kzgProof = opts.data.subarray(144, 192)

  if (bytesToBigInt(z) >= BLS_MODULUS || bytesToBigInt(y) >= BLS_MODULUS) {
    if (opts._debug !== undefined) {
      opts._debug(`KZG_POINT_EVALUATION (0x14) failed: POINT_GREATER_THAN_BLS_MODULUS`)
    }

    return EvmErrorResult(new EvmError(ERROR.POINT_GREATER_THAN_BLS_MODULUS), opts.gasLimit)
  }

  if (bytesToHex(computeVersionedHash(commitment, version)) !== bytesToHex(versionedHash)) {
    if (opts._debug !== undefined) {
      opts._debug(`KZG_POINT_EVALUATION (0x14) failed: INVALID_COMMITMENT`)
    }
    return EvmErrorResult(new EvmError(ERROR.INVALID_COMMITMENT), opts.gasLimit)
  }

  if (opts._debug !== undefined) {
    opts._debug(
      `KZG_POINT_EVALUATION (0x14): proof verification with commitment=${bytesToHex(
        commitment
      )} z=${bytesToHex(z)} y=${bytesToHex(y)} kzgProof=${bytesToHex(kzgProof)}`
    )
  }

  try {
    if (kzg.verifyKzgProof(commitment, z, y, kzgProof) === false) {
      return EvmErrorResult(new EvmError(ERROR.INVALID_COMMITMENT), opts.gasLimit)
    }
  } catch {
    return EvmErrorResult(new EvmError(ERROR.INVALID_COMMITMENT), opts.gasLimit)
  }

  // Return value - FIELD_ELEMENTS_PER_BLOB and BLS_MODULUS as padded 32 byte big endian values
  const fieldElementsBuffer = setLengthLeft(bigIntToBytes(fieldElementsPerBlob), 32)
  const modulusBuffer = setLengthLeft(bigIntToBytes(BLS_MODULUS), 32)

  if (opts._debug !== undefined) {
    opts._debug(
      `KZG_POINT_EVALUATION (0x14) return fieldElements=${bytesToHex(
        fieldElementsBuffer
      )} modulus=${bytesToHex(modulusBuffer)}`
    )
  }

  return {
    executionGasUsed: gasUsed,
    returnValue: concatBytesNoTypeCheck(fieldElementsBuffer, modulusBuffer),
  }
}
