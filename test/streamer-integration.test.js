import assert from 'assert'
import fs from 'fs'
import all from 'it-all'
import { equals } from 'uint8arrays/equals'
import { toString } from 'uint8arrays/to-string'
import pDefer from 'p-defer'

import { CarReader, CarIndexer, CarWriter } from '@ipld/car'
import { recursive as exporter } from 'ipfs-unixfs-exporter'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { sha256 } from 'multiformats/hashes/sha2'
import { createFromBlob, Type } from '@hash-stream/index/record'
import { IndexReader } from '@hash-stream/index/reader'
import { createPacks, PackReader } from '@hash-stream/pack'
import { HTTPPackStore } from '@hash-stream/pack/store/http'
import { HashStreamer } from '@hash-stream/streamer'
import { createUnixFsStreams } from '@hash-stream/utils/index/unixfs'

import { SingularityLikeIndexStore, DagPbCode } from '../src/index.js'
import { joinUrlPaths } from '../src/utils.js'

import {
  createTestDatabase,
  insertInitialData,
  insertCarBlockEntry,
  insertFileEntry,
  getCarBlockStmt,
} from './helpers/create-test-db.js'
import { randomBytes, randomCID } from './helpers/random.js'
import { createInMemoryHTTPServer } from './helpers/http-server.js'
import {
  encodeVarint,
  decodeVarint,
  readAll,
  readLast,
  getBytesFromChunckedBytes,
} from './helpers/utils.js'

const storagePathPrefix = 'download'

describe('Singularity like IndexStore with index reader and streamer backed by runtime data inserted', () => {
  /** @type {import('better-sqlite3').Database} */
  let db
  /** @type {string} */
  let tmpFile
  /** @type {any} */
  let initialData
  /** @type {SingularityLikeIndexStore} */
  let store
  /** @type {import('@hash-stream/index/types').IndexReader} */
  let indexReader
  /** @type {CustomHTTPPackStore} */
  let packStore
  /** @type {PackReader} */
  let packReader
  /** @type {HashStreamer} */
  let hashStreamer

  beforeEach(async () => {
    packStore = await getPackStore()
    const host = packStore.directory.origin

    const testDatabase = createTestDatabase()
    db = testDatabase.db
    tmpFile = testDatabase.tmpFile
    store = new SingularityLikeIndexStore({
      storageTypes: ['example.com'],
      storagePathPrefix,
      filename: testDatabase.tmpFile,
    })

    initialData = insertInitialData(testDatabase.db, { frontEndpoint: host })

    indexReader = new IndexReader(store)
    packReader = new PackReader(packStore)
    hashStreamer = new HashStreamer(indexReader, packReader)
  })

  afterEach(async () => {
    db.close()
    if (fs.existsSync(tmpFile)) {
      fs.rmSync(tmpFile, { recursive: true, force: true })
    }
    await packStore.destroy()
  })

  it('returns empty for non-existent entries', async () => {
    const blockCid = await randomCID()
    const retrieved = await all(store.get(blockCid.multihash))
    assert.deepEqual(retrieved, [])
  })

  it('can store and retrieve a blob index record', async () => {
    const bytes = await randomBytes(1000)
    const blobCid = await randomCID({ bytes })
    const packCid = await randomCID()
    const offset = 0
    const length = bytes.byteLength

    const blob = createFromBlob(
      blobCid.multihash,
      packCid.multihash,
      offset,
      length
    )

    // Calculate varint (CID bytes length + raw block bytes length)
    const blockLength = blobCid.bytes.byteLength + (blob.length || 0)
    const varintBytes = encodeVarint(blockLength)

    // Decode varint
    const decodedVarint = decodeVarint(toString(varintBytes, 'base64'))
    assert.strictEqual(decodedVarint.payloadLength, blockLength)
    assert.strictEqual(decodedVarint.varintBytes, varintBytes.byteLength)
    assert.strictEqual(
      decodedVarint.carBlockLength,
      blockLength + varintBytes.byteLength
    )

    getCarBlockStmt(db).run(
      0,
      CID.createV1(raw.code, blob.multihash).bytes, // Convert multihash to CID bytes
      blob.offset,
      decodedVarint.carBlockLength, // Total length of the block + varint length
      varintBytes,
      null, // rawBlock is not used in this example
      blob.offset,
      initialData.carsSecond,
      initialData.files
    )

    const records = await all(store.get(blob.multihash))
    assert(records.length === 1)
    assert.strictEqual(records[0].offset, offset)
    assert.strictEqual(records[0].length, length)
    assert(typeof records[0].location === 'string')
    const expectedLocation = joinUrlPaths(
      initialData.frontEndpoint,
      storagePathPrefix,
      initialData.storagePath,
      initialData.filePath
    )
    assert.strictEqual(records[0].location, expectedLocation)
    assert(records[0].type === Type.BLOB)
  })

  it('reads stream of verifiable blobs from written inline blob records and verifies all the blocks', async () => {
    const byteLength = 5_000_000
    const bytes = await randomBytes(byteLength)
    const blob = new Blob([bytes])

    // Create UnixFS file link stream to gather pointers to original data
    const { unixFsFileLinkReadable, unixFsReadable } = createUnixFsStreams(blob)
    /** @type {import('p-defer').DeferredPromise<import('@hash-stream/utils/index/types').Block>} */
    const rootBlockDefer = pDefer()

    void (async () => {
      const rootBlock = await readLast(unixFsReadable)
      rootBlockDefer.resolve(rootBlock)
    })()
    const unixFsFileLinkEntries = await readAll(unixFsFileLinkReadable)

    // Pack as a CAR file to simulate SIngularity-like storage
    const { packStream, containingPromise } = createPacks(blob, {
      type: /** @type {'car'} */ ('car'),
    })
    const packs = await all(packStream)
    assert(packs.length === 1)
    const pack = packs[0]

    // Store created Pack
    const path = joinUrlPaths(
      storagePathPrefix,
      initialData.storagePath,
      initialData.filePath
    )

    // store the original file
    await packStore.put(path, bytes)

    // Get containing multihash from the promise
    const containingMultihash = await containingPromise
    assert(containingMultihash)

    const containingCid = CID.createV1(DagPbCode, containingMultihash)

    // Go through the Pack, read all the blobs and create index records for them
    // Root Block Index Record should be inline blob
    // and all the other blocks should be stored as blobs pointing to the Pack
    const readerBlobStore = await CarReader.fromBytes(pack.bytes)
    const blobIterable = await CarIndexer.fromBytes(pack.bytes)

    // Insert the file entry into the store
    const fileId = insertFileEntry(db, initialData, containingCid)

    // Add the index records to the store using SQL and keep blobs
    const blobIndexRecords = []
    for await (const blob of blobIterable) {
      // Get the block from the reader
      const block = await readerBlobStore.get(blob.cid)
      assert(block)

      // Get the unixFs entry
      const unixFsEntry = unixFsFileLinkEntries.find((entry) =>
        entry.cid.equals(blob.cid)
      )
      assert(unixFsEntry, `UnixFS entry not found for CID: ${blob.cid}`)

      // Calculate varint (CID bytes length + raw block bytes length)
      const blockLength = blob.cid.bytes.byteLength + (block.bytes.length || 0)
      const varint = encodeVarint(blockLength)

      // Decode varint
      const decodedVarint = decodeVarint(toString(varint, 'base64'))

      // Root block is inline blob record
      let record
      if (blob.cid.code === DagPbCode) {
        record = {
          cid: blob.cid,
          carOffset: blob.blockOffset,
          carBlockLength: decodedVarint.carBlockLength,
          varint,
          rawBlock: block.bytes,
          fileOffset: 0, // Root block is at offset 0
          carId: initialData.carsSecond,
          fileId: null,
        }
      } else if (blob.cid.code === raw.code) {
        record = {
          cid: blob.cid,
          carOffset: blob.blockOffset,
          carBlockLength: decodedVarint.carBlockLength,
          varint,
          rawBlock: null,
          fileOffset: unixFsEntry.contentByteOffset || 0,
          carId: initialData.carsSecond,
          fileId,
        }
      } else {
        throw new Error(`Unexpected blob CID code: ${blob.cid.code}`)
      }

      insertCarBlockEntry(db, record)
      blobIndexRecords.push(record)
    }

    // Get verifiable blobs from the containing multihash individually for each blob
    for (const blobIndexRecord of blobIndexRecords) {
      const verifiableBlobs = await all(
        hashStreamer.stream(blobIndexRecord.cid.multihash, {
          containingMultihash,
        })
      )
      assert(verifiableBlobs.length === 1)

      // Verify hash and compute hash from retrieve bytes for verifiability
      const verifiableBlob = verifiableBlobs[0]

      assert(
        equals(
          verifiableBlob.multihash.bytes,
          blobIndexRecord.cid.multihash.bytes
        )
      )

      const computedHash = await sha256.digest(verifiableBlob.bytes)
      assert(equals(verifiableBlob.multihash.bytes, computedHash.bytes))

      // Check if matches block content read from blockstore
      const rawCid = CID.createV1(raw.code, blobIndexRecord.cid.multihash)
      let block = await readerBlobStore.get(rawCid)

      if (!block) {
        const dagPbCid = CID.createV1(DagPbCode, blobIndexRecord.cid.multihash)
        block = await readerBlobStore.get(dagPbCid)
      }

      assert(block)
      assert(equals(block.bytes, verifiableBlob.bytes))

      // Check if the bytes match the root block bytes from the Pack
      if (
        equals(blobIndexRecord.cid.multihash.bytes, containingMultihash.bytes)
      ) {
        const rootBlock = await rootBlockDefer.promise
        assert(equals(rootBlock.bytes, verifiableBlob.bytes))
        continue // Skip further checks for the root block
      }

      // Check if matches original bytes in the range of the file unless is the root
      const unixFsEntry = unixFsFileLinkEntries.find((entry) =>
        entry.cid.equals(blobIndexRecord.cid)
      )
      assert(
        unixFsEntry,
        `UnixFS entry not found for CID: ${blobIndexRecord.cid}`
      )
      const originalBytes = bytes.slice(
        blobIndexRecord.fileOffset,
        blobIndexRecord.fileOffset + unixFsEntry.contentByteLength
      )
      assert(equals(originalBytes, verifiableBlob.bytes))
    }

    // Create a CAR file to store the containing multihash blobs
    const { writer: carWriter, out } = await CarWriter.create([containingCid])

    // Collect CAR output into an in-memory Uint8Array
    /** @type {Uint8Array[]} */
    const chunks = []
    const collectChunks = (async () => {
      for await (const chunk of out) {
        chunks.push(chunk)
      }
    })()

    // Get verifiable blobs from the containing and write them into the CAR
    for await (const { multihash, bytes } of hashStreamer.stream(
      containingMultihash
    )) {
      let cid
      if (equals(multihash.bytes, containingMultihash.bytes)) {
        // containing multihash not raw code
        cid = CID.createV1(DagPbCode, multihash)
      } else {
        cid = CID.createV1(raw.code, multihash)
      }
      carWriter.put({ cid, bytes })
    }
    await carWriter.close()

    // Wait for chunk collection to complete
    await collectChunks

    // Read the CAR file generated
    const writtenCarBytes = getBytesFromChunckedBytes(chunks)
    const readerBlockStore = await CarReader.fromBytes(writtenCarBytes)
    const roots = await readerBlockStore.getRoots()
    assert(roots.length === 1)

    // Reconstruct blob with unixfs exporter
    const entries = exporter(roots[0], {
      async get(cid) {
        const block = await readerBlockStore.get(cid)
        if (!block) {
          throw new Error(`Block not found in exported content: ${cid}`)
        }
        return block.bytes
      },
    })

    const fileEntries = await all(entries)
    assert(fileEntries.length === 1)
    const file = fileEntries[0]
    const collectedFileChunks = await all(file.content())
    const writtenContentBytes = getBytesFromChunckedBytes(collectedFileChunks)

    // Guarantees read file from pack is exactly the same as written before
    assert.strictEqual(writtenContentBytes.length, bytes.length)
    assert(equals(writtenContentBytes, bytes))
  })
})

/**
 * @typedef {import('@hash-stream/pack/store/http').HTTPPackStore & { directory: URL, put: (target: import('@hash-stream/pack/types').MultihashDigest | import('@hash-stream/pack/types').Path, data: Uint8Array) => Promise<void>, destroy: () => Promise<void> }} CustomHTTPPackStore
 */

/**
 * @returns {Promise<CustomHTTPPackStore>}
 */
async function getPackStore() {
  const httpServer = createInMemoryHTTPServer()
  const { baseURL, store } = await httpServer.start()

  const packStore = new HTTPPackStore({
    url: baseURL,
    prefix: '',
    extension: ''
  })
  const destroyablePackStore = Object.assign(packStore, {
    directory: baseURL,
    /**
     * Put a pack file in S3.
     *
     * @param {import('@hash-stream/pack/types').MultihashDigest | import('@hash-stream/pack/types').Path} target
     * @param {Uint8Array} data - The pack file bytes.
     */
    put: async (target, data) => {
      const key = packStore._getObjectKey(target)
      store.set(`/${key}`, data)
    },
    destroy: () => {
      return httpServer.stop()
    },
  })
  return Promise.resolve(destroyablePackStore)
}
