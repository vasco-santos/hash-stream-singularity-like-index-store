import { CID } from 'multiformats'
import { sha256 } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'
import { webcrypto } from '@storacha/one-webcrypto'

/**
 * @param {number} size
 */
export async function randomBytes(size) {
  const bytes = new Uint8Array(size)
  while (size) {
    const chunk = new Uint8Array(Math.min(size, 65_536))
    webcrypto.getRandomValues(chunk)

    size -= chunk.length
    bytes.set(chunk, size)
  }
  return bytes
}

/**
 * @param {object} options
 * @param {Uint8Array} [options.bytes] - Bytes to use for the CID, if not provided a random 10 byte value will be used.
 * @returns {Promise<CID>} A CID with a raw codec and sha256 hash.
 */
export async function randomCID(options = {}) {
  let bytes = options.bytes
  if (!bytes) {
    bytes = await randomBytes(10)
  }
  const hash = await sha256.digest(bytes)
  return CID.create(1, raw.code, hash)
}

export const CarCode = 0x0202
