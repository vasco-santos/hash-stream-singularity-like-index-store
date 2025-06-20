import fs from 'fs'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'
import { test } from '@hash-stream/index/test'

import { SingularityLikeIndexStore } from '../src/index.js'

import {
  createTestDatabase,
  insertInitialData,
  getCarBlockStmt,
} from './helpers/create-test-db.js'

const storagePathPrefix = 'download'

/**
 * @typedef {import('@hash-stream/index/types').IndexStore} IndexStore
 *
 * @typedef {object} Destroyable
 * @property {() => void} destroy
 * @property {any} initialData
 *
 * @typedef {IndexStore & Destroyable} DestroyableIndexStore
 */

// TODO: needs to be fixed given it expects add to work out of the box
describe.skip('Singularity like IndexStore interface', () => {
  // eslint-disable-next-line no-extra-semi
  ;[
    {
      name: 'SingularityLikeIndexStore',
      getIndexStore: () => {
        let id = 0
        const testDatabase = createTestDatabase()
        const indexStore = new SingularityLikeIndexStore({
          storageTypes: ['example.com'],
          storagePathPrefix,
          filename: testDatabase.tmpFile,
        })
        const initialData = insertInitialData(testDatabase.db)

        const destroyableIndexStore = Object.assign(indexStore, {
          /**
           * Add index entries.
           *
           * @param {AsyncIterable<import('@hash-stream/index/types').IndexRecord>} entries
           * @param {string} recordType
           * @returns {Promise<void>}
           */
          async add(entries, recordType) {
            for await (const entry of entries) {
              // insert to the Database car_blocks table
              getCarBlockStmt(testDatabase.db).run(
                id,
                // TODO: depend on record type?
                CID.createV1(raw.code, entry.multihash).bytes, // Convert multihash to CID bytes
                entry.offset,
                entry.length,
                null, // TODO: varint is not used in this example yet
                null, // Assuming rawBlock is a Buffer or Uint8Array TODO
                entry.offset,
                initialData.carsSecond,
                initialData.files
              )
              id++
            }
          },
          destroy: () => {
            testDatabase.db.close()
            if (fs.existsSync(testDatabase.tmpFile)) {
              fs.rmSync(testDatabase.tmpFile, { recursive: true, force: true })
            }
          },
          initialData,
        })
        return Promise.resolve(destroyableIndexStore)
      },
    },
  ].forEach(({ name, getIndexStore }) => {
    test.store(name, () => getIndexStore())
  })
})
