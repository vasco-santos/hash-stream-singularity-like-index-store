import assert from 'assert'
import fs from 'fs'
import { equals } from 'uint8arrays/equals'

import * as dagPB from '@ipld/dag-pb'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { Type } from '@hash-stream/index/record'

import { SingularityLikeIndexStore, DagPbCode } from '../src/index.js'
import { joinUrlPaths } from '../src/utils.js'

import { createTestDatabase, runFixtures } from './helpers/create-test-db.js'

const storagePathPrefix = 'download'

describe('Singularity like IndexStore with real fixture sql data inserted', () => {
  /** @type {import('better-sqlite3').Database} */
  let db
  /** @type {string} */
  let tmpFile
  /** @type {any} */
  let initialData

  beforeEach(() => {
    const testDatabase = createTestDatabase()
    db = testDatabase.db
    tmpFile = testDatabase.tmpFile

    initialData = runFixtures(db)
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(tmpFile)) {
      fs.rmSync(tmpFile, { recursive: true, force: true })
    }
  })

  it('complex interaction to find dag pb block and linked blocks as expected', async () => {
    const dagPbCid = CID.parse(
      'bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au'
    )
    const indexStore = new SingularityLikeIndexStore({
      storageTypes: ['example.com'],
      storagePathPrefix,
      filename: tmpFile,
    })

    const records = []
    for await (const record of indexStore.get(dagPbCid.multihash)) {
      records.push(record)
    }

    // Check we got the expected number of records
    assert(records.length === 4)

    // Check the DAG-PB record
    const dagPbRecord = records.find((r) => r.type === Type.INLINE_BLOB)
    assert(dagPbRecord)
    assert(dagPbRecord.offset === 0)
    assert(typeof dagPbRecord.location !== 'string')
    assert(dagPbRecord.length === dagPbRecord.location.digest.length)
    assert.deepEqual(dagPbRecord.subRecords, [])
    assert(equals(dagPbRecord.multihash.bytes, dagPbCid.multihash.bytes))

    // Check bytes are exactly the same as the CID bytes
    const computedHash = await sha256.digest(dagPbRecord.location.digest)
    assert(equals(computedHash.bytes, dagPbCid.multihash.bytes))

    // Decode the DAG-PB record
    const decoded = dagPB.decode(dagPbRecord.location.digest)

    // Verify if the decoded record links are in the remaining records
    assert(decoded.Links.length === records.length - 1)

    let currentOffset = 0
    for (const link of decoded.Links) {
      const linkRecord = records.find((r) =>
        equals(r.multihash.bytes, link.Hash.multihash.bytes)
      )

      assert(linkRecord)
      assert(linkRecord.type === Type.BLOB)
      assert(linkRecord.length === link.Tsize)
      assert.deepEqual(linkRecord.subRecords, [])
      assert(typeof linkRecord.location === 'string')
      assert.equal(
        linkRecord.location,
        joinUrlPaths(
          initialData.frontEndpoint,
          storagePathPrefix,
          initialData.storagePath,
          initialData.filePath
        )
      )

      assert(
        linkRecord.offset === currentOffset,
        `Offset mismatch for ${linkRecord.multihash.toString()}: expected ${currentOffset}, got ${
          linkRecord.offset
        }`
      )
      currentOffset += link.Tsize || 0
    }

    // Validate the total file size matches the expect size
    const linksTotalSize = decoded.Links.reduce(
      (sum, link) => sum + (link.Tsize || 0),
      0
    )

    const linkRecords = records.filter((r) => r.type === Type.BLOB)
    const totalSize = linkRecords.reduce((sum, r) => sum + (r.length || 0), 0)

    assert(
      totalSize === linksTotalSize,
      `Total size mismatch: expected ${linksTotalSize}, got ${totalSize}`
    )
  })

  it('simple interaction to find raw block as expected', async () => {
    const indexStore = new SingularityLikeIndexStore({
      storageTypes: ['example.com'],
      storagePathPrefix,
      filename: tmpFile,
    })
    const rawCid = CID.parse(
      'bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq'
    )

    const records = []
    for await (const record of indexStore.get(rawCid.multihash)) {
      records.push(record)
    }

    // Check we got the expected number of records
    assert(records.length === 1)

    // Check the record is a raw block
    const record = records[0]
    assert(record)
    assert(record.type === Type.BLOB)
    assert(record.offset === 0)
    assert(record.length === 1048576) // The length of the raw block
    assert(typeof record.location === 'string') // Inline blob should not have a location
    assert.equal(
      record.location,
      joinUrlPaths(
        initialData.frontEndpoint,
        storagePathPrefix,
        initialData.storagePath,
        initialData.filePath
      )
    )
    assert.deepEqual(record.subRecords, [])
    assert(equals(record.multihash.bytes, rawCid.multihash.bytes))
  })

  it('simple interaction to find raw block with empty path prefix', async () => {
    const indexStore = new SingularityLikeIndexStore({
      storageTypes: ['example.com'],
      storagePathPrefix: '',
      filename: tmpFile,
    })
    const rawCid = CID.parse(
      'bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq'
    )

    const records = []
    for await (const record of indexStore.get(rawCid.multihash)) {
      records.push(record)
    }

    // Check we got the expected number of records
    assert(records.length === 1)

    // Check the record is a raw block
    const record = records[0]
    assert(record)
    assert(typeof record.location === 'string') // Inline blob should not have a location
    assert.equal(
      record.location,
      joinUrlPaths(
        initialData.frontEndpoint,
        '',
        initialData.storagePath,
        initialData.filePath
      )
    )
  })

  it('complex interaction to find dag pb block does not find record if no required cid codes', async () => {
    const dagPbCid = CID.parse(
      'bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au'
    )
    const rawCid = CID.parse(
      'bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq'
    )

    const indexStoreWithRawCode = new SingularityLikeIndexStore({
      storageTypes: ['example.com'],
      storagePathPrefix,
      filename: tmpFile,
      cidCodes: [raw.code], // Only RawCode, not DagPbCode
    })

    // Attempt to get records for the DAG-PB CID
    // This should return no records since we are not using DagPbCode
    // in the cidCodes configuration.
    const recordsWithOnlyRawCode = []
    for await (const record of indexStoreWithRawCode.get(dagPbCid.multihash)) {
      recordsWithOnlyRawCode.push(record)
    }

    const indexStoreWithDagPbCode = new SingularityLikeIndexStore({
      storageTypes: ['example.com'],
      storagePathPrefix,
      filename: tmpFile,
      cidCodes: [DagPbCode], // Only DagPbCode, not DagPbCode
    })

    // Attempt to get records for the DAG-PB CID
    // This should return all the records associated with the DAG-PB CID
    // since we are using DagPbCode in the cidCodes configuration for the initial query.
    const recordsWithOnlyDagPbCode = []
    for await (const record of indexStoreWithDagPbCode.get(
      dagPbCid.multihash
    )) {
      recordsWithOnlyDagPbCode.push(record)
    }

    // Check we got the expected number of records
    assert(recordsWithOnlyDagPbCode.length === 4)

    const recordsWithOnlyDagPbCodeFromRawCid = []
    for await (const record of indexStoreWithDagPbCode.get(rawCid.multihash)) {
      recordsWithOnlyDagPbCodeFromRawCid.push(record)
    }

    // Check we got the expected number of records
    assert(recordsWithOnlyDagPbCodeFromRawCid.length === 0)
  })

  it('fails to find records when in different storage type', async () => {
    const indexStore = new SingularityLikeIndexStore({
      storageTypes: ['not-example.com'],
      storagePathPrefix,
      filename: tmpFile,
    })

    const records = []
    for await (const record of indexStore.get(
      CID.parse('bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq')
        .multihash
    )) {
      records.push(record)
    }
    assert(records.length === 0)
  })
})
