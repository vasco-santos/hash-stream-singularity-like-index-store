/* global Buffer */

import Database from 'better-sqlite3'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve, isAbsolute } from 'path'

import { CID } from 'multiformats/cid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ========= Parse Arguments =========
const args = process.argv.slice(2)

const dbArg = args.find((arg) => arg.startsWith('--db-path='))
const jsonArg = args.find((arg) => arg.startsWith('--json-path='))

if (!dbArg || !jsonArg) {
  console.error('Usage: node script.js --db-path=./test.db --json-path=./example/data.json')
  process.exit(1)
}

const databaseFilePath = toAbsolutePath(dbArg.split('=')[1])
const pieceJsonPath = toAbsolutePath(jsonArg.split('=')[1])

console.log(`Database path: ${databaseFilePath}`)
console.log(`JSON path: ${pieceJsonPath}`)

// ========= Run =========
createTestDatabase(databaseFilePath, pieceJsonPath)
console.log(`Test database created at: ${databaseFilePath}`)

// ========= Helpers =========

function toAbsolutePath(p) {
  return isAbsolute(p) ? p : resolve(process.cwd(), p)
}

/**
 * @param {string} databaseFilePath
 * @param {string} pieceJsonPath
 * @returns {{ db: import('better-sqlite3').Database, databaseFilePath: string }}
 */
export function createTestDatabase(databaseFilePath, pieceJsonPath) {
  /** @type {import('better-sqlite3').Database} */
  const db = new Database(databaseFilePath)

  // Load schema (e.g., from file or string)
  const schemaSql = fs.readFileSync(
    join(__dirname, '../fixtures/singularity-schema.sql'),
    'utf8'
  )
  db.exec(schemaSql)

  // Insert initial data
  const json = JSON.parse(fs.readFileSync(pieceJsonPath, 'utf-8'))
  insertFromJson(db, json)
  console.log('Data inserted successfully')

  return { db, databaseFilePath }
}

/**
 * Insert data from JSON into the SQLite database,
 * including foreign key dependencies like directories and attachments.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {any} data
 */
export function insertFromJson(db, data) {
  db.transaction(() => {
    const { car, storage, carBlocks, files } = data

    // === Storages ===
    db.prepare(
      `INSERT OR IGNORE INTO storages
      (id, name, created_at, updated_at, type, path, config, client_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      storage.id,
      storage.name,
      storage.createdAt,
      storage.updatedAt,
      storage.type,
      storage.path,
      JSON.stringify(storage.config),
      JSON.stringify(storage.clientConfig || {})
    )

    // === Preparations ===
    db.prepare(
      `INSERT OR IGNORE INTO preparations
      (id, name, created_at, updated_at, delete_after_export, max_size, piece_size, min_piece_size, no_inline, no_dag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      car.preparationId,
      'example-preparation',
      car.createdAt,
      car.createdAt,
      0,
      null,
      null,
      null,
      0,
      0
    )

    // === Source Attachments ===
    const allAttachmentIds = new Set([
      car.attachmentId,
      ...(files.map(f => f.attachmentId)),
    ])
    for (const attachmentId of allAttachmentIds) {
      db.prepare(
        `INSERT OR IGNORE INTO source_attachments
        (id, preparation_id, storage_id)
        VALUES (?, ?, ?)`
      ).run(attachmentId, car.preparationId, storage.id)
    }

    // === Jobs ===
    if (car.jobId != null) {
      db.prepare(
        `INSERT OR IGNORE INTO jobs
        (id, type, state, error_message, error_stack_trace, worker_id, attachment_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        car.jobId,
        'example-job',
        'done',
        null,
        null,
        null,
        car.attachmentId
      )
    }

    // === Directories ===
    const allDirectoryIds = new Set(files.map(f => f.directoryId).filter(Boolean))
    for (const dirId of allDirectoryIds) {
      db.prepare(
        `INSERT OR IGNORE INTO directories
        (id, cid, name, exported, attachment_id, parent_id)
        VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        dirId,
        Buffer.from(car.rootCid, 'base64'), // Could be improved to use actual CID if available
        `unknown_directory_${dirId}`,
        0,
        car.attachmentId,
        null
      )
    }

    // === Cars ===
    const carsToInsert = [car]
    const carIdsFromBlocks = [...new Set(carBlocks.map(cb => cb.carId).filter(Boolean))]
    const missingCarIds = carIdsFromBlocks.filter(id => id !== car.id)
    for (const id of missingCarIds) {
      carsToInsert.push({
        id,
        createdAt: car.createdAt,
        pieceType: '',
        pieceCid: '01711220AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        pieceSize: 1,
        rootCid: '01711220BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        fileSize: 1,
        storageId: storage.id,
        storagePath: '',
        numOfFiles: 0,
        preparationId: car.preparationId,
        attachmentId: car.attachmentId,
        jobId: null,
      })
    }

    for (const c of carsToInsert) {
      db.prepare(
        `INSERT OR IGNORE INTO cars
        (id, created_at, piece_type, piece_cid, piece_size, root_cid, file_size, storage_id,
         storage_path, num_of_files, preparation_id, attachment_id, job_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        c.id,
        c.createdAt,
        c.pieceType || '',
        Buffer.isBuffer(c.pieceCid) ? c.pieceCid : Buffer.from(c.pieceCid, 'base64'),
        c.pieceSize,
        Buffer.isBuffer(c.rootCid) ? c.rootCid : Buffer.from(c.rootCid, 'base64'),
        c.fileSize,
        c.storageId,
        c.storagePath,
        c.numOfFiles,
        c.preparationId,
        c.attachmentId,
        c.jobId
      )
    }

    // === Files ===
    for (const file of files) {
      db.prepare(
        `INSERT OR IGNORE INTO files
        (id, cid, path, hash, size, last_modified_nano, attachment_id, directory_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        file.id,
        CID.parse(file.cid).bytes, // Ensure CID is in bytes format
        file.path,
        file.hash,
        file.size,
        file.lastModifiedNano,
        file.attachmentId,
        file.directoryId
      )
    }

    // === Car Blocks ===
    for (const block of carBlocks) {
      db.prepare(
        `INSERT OR IGNORE INTO car_blocks
        (id, cid, car_offset, car_block_length, varint, raw_block,
         file_offset, car_id, file_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        block.id,
        CID.parse(block.cid).bytes, // Ensure CID is in bytes format
        block.carOffset,
        block.carBlockLength,
        Buffer.from(block.varint, 'base64'),
        block.rawBlock ? Buffer.from(block.rawBlock, 'base64') : null,
        block.fileOffset,
        block.carId,
        block.fileId
      )
    }
  })()
}
