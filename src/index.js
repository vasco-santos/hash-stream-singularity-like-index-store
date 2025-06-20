import * as API from '@hash-stream/index/types'
import { Type as IndexRecordType } from '@hash-stream/index/record'

import Database from 'better-sqlite3'

import * as dagPb from '@ipld/dag-pb'
import { CID } from 'multiformats/cid'
import * as Block from 'multiformats/block'
import { code as RawCode } from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { identity } from 'multiformats/hashes/identity'

import * as query from './query.js'
import { joinUrlPaths } from './utils.js'

export const DagPbCode = 0x70

/**
 * A class that implements the IndexStore interface for Singularity-like index stores.
 *
 * @implements {API.IndexStoreReader}
 */
export class SingularityLikeIndexStore {
  /**
   * @param {object} config - Configuration for the S3 client.
   * @param {string[]} config.storageTypes - Storage type to accept.
   * @param {string} config.storagePathPrefix - Path prefix for stored objects.
   * @param {string} config.filename - Path to the SQLite database file.
   * @param {number[]} [config.cidCodes] - Array of CID codes to try on queries.
   */
  constructor(config) {
    this.filename = config.filename
    this.storageType = config.storageTypes
    this.storagePathPrefix = config.storagePathPrefix || ''
    this.cidCodes = config.cidCodes || [RawCode, DagPbCode]
    /** @type {import('better-sqlite3').Database} */
    this.db = new Database(config.filename)
  }
  /**
   * @param {API.MultihashDigest} hash
   * @returns {AsyncIterable<API.IndexRecord>}
   */
  async *get(hash) {
    /** @type {any} */
    let rows = []

    // This allows us to try different CID codes until we find a match
    // or exhaust the list of codes.
    for (const code of this.cidCodes) {
      const encodedCid = CID.createV1(code, hash)
      rows = this.db.prepare(query.byBlockCid).all(encodedCid.bytes)

      // If we found rows, break out of the loop
      if (rows.length > 0) {
        // If we used a DagPb CID, we can also try to find the CIDs associated with it
        // by checking the files table.
        // This is useful for cases where the CID refers to a file, and we want to find
        // all blocks that belong to that file.
        if (code === DagPbCode) {
          const fileRows = this.db
            .prepare(query.byFileCid)
            .all(encodedCid.bytes)
          rows = rows.concat(fileRows)
        }
        break
      }
    }

    for (const row of rows) {
      // Make sure the row has a valid storage type
      // and that it matches one of the accepted storage types.
      // If not, skip this row.
      if (!row.storage_type || !this.storageType.includes(row.storage_type)) {
        continue
      }
      const cid = CID.decode(row.cid)
      const storage = JSON.parse(row.storage_config)

      if (row.raw_block) {
        // If raw_block is present, use it directly as location given
        // it is a dag-pb block.
        const decodedBlock = await Block.decode({
          bytes: row.raw_block,
          codec: dagPb,
          hasher: sha256,
        })
        yield {
          multihash: cid.multihash,
          type: IndexRecordType.INLINE_BLOB,
          location: identity.digest(decodedBlock.bytes),
          length: decodedBlock.bytes.length,
          offset: 0,
          subRecords: [],
        }
      } else {
        // calculate the block length based on the CAR block length and its component lengths
        const length =
          row.car_block_length - cid.bytes.length - row.varint.length
        yield {
          multihash: cid.multihash,
          type: IndexRecordType.BLOB,
          location: joinUrlPaths(
            storage.front_endpoint,
            this.storagePathPrefix,
            row.storage_path,
            row.file_path
          ),
          length,
          offset: row.file_offset,
          subRecords: [],
        }
      }
    }
  }
}
