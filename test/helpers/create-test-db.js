/* global Buffer */

import Database from 'better-sqlite3'
import { fileSync } from 'tmp'

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import { CID } from 'multiformats/cid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 *
 * @returns {{ db: import('better-sqlite3').Database, tmpFile: string }}
 */
export function createTestDatabase() {
  const tmpFile = fileSync({ postfix: '.sqlite' })
  /** @type {import('better-sqlite3').Database} */
  const db = new Database(tmpFile.name)

  // Load schema (e.g., from file or string)
  const schemaSql = readFileSync(
    join(__dirname, '../fixtures/singularity-schema.sql'),
    'utf8'
  )
  db.exec(schemaSql)

  return { db, tmpFile: tmpFile.name }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function runFixtures(db) {
  const dagPbCid = CID.parse(
    'bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au'
  )
  // Insert fixtures (e.g., from file or string)
  const fixturesSql = readFileSync(
    join(__dirname, '../fixtures/singularity-insert-data.sql'),
    'utf8'
  )
  db.exec(fixturesSql)

  // --- Handle the problematic car_blocks insert with raw_block in JavaScript ---

  // Your long raw_block hex string
  const base64s =
    'EiwKJAFVEiD3fXHsfAtzuy4Rs7Bao4IZFk1sp6n7TiW9l6c8Fsd4ZBIAGICAQBIsCiQBVRIgknipVUA6k+D7/at6kJIKw3djt7YFeTtVtexkvTN3gc8SABiAgEASLAokAVUSIGLF/7OZ+6M6WJKEtwumIV6ucqv+G0o2Z3ZQ1CCgJ1ekEgAYs8EDChMIAhizwYMBIICAQCCAgEAgs8ED'
  // Convert hex string to a Buffer (which better-sqlite3 handles as a BLOB)
  const rawBlockBuffer = Buffer.from(base64s, 'base64')

  // Prepare the insert statement
  const insertStmt = db.prepare(`
    INSERT INTO car_blocks (id, cid, car_offset, car_block_length, varint, raw_block, file_offset, car_id, file_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // Execute the insert statement with parameters
  insertStmt.run(
    377351956,
    dagPbCid.bytes,
    2154851,
    197,
    Buffer.from('C301', 'hex'), // varint as Buffer
    rawBlockBuffer, // This is your large BLOB, passed as a Buffer
    0,
    17482,
    null // file_id was NULL
  )

  return {
    dagPbCid,
    frontEndpoint: 'https://example.com',
    storagePath: 'collection-name',
    filePath: 'filename.mp3',
  }
}

/**
 * Inserts the initial data from the SQL fixture into the database.
 *
 * @param {import('better-sqlite3').Database} db - The better-sqlite3 database instance.
 * @param {{ frontEndpoint?: string }} [options] - Options containing the front endpoint URL.
 */
export function insertInitialData(db, options = {}) {
  const initialDataIds = {
    storages: 400,
    preparations: 400,
    sourceAttachments: 396,
    jobs: 3688,
    carsFirst: 3238,
    directories: 1,
    carsSecond: 17482,
    files: 2085318,
    frontEndpoint: options.frontEndpoint || 'https://example.com',
    storagePath: 'collection-name',
    filePath: 'filename.mp3',
  }
  db.transaction(() => {
    // 1. storages
    db.prepare(
      `
      INSERT INTO storages (id, name, created_at, updated_at, type, path, config, client_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      initialDataIds.storages,
      'collection-name',
      '2024-12-13T17:37:44.703659Z',
      '2024-12-13T17:37:44.703659Z',
      'example.com',
      initialDataIds.storagePath,
      `{"disable_checksum":"true","encoding":"Slash,LtGt,CrLf,Del,Ctl,InvalidUtf8,Dot","endpoint":"https://s3.us.example.com","front_endpoint":"${initialDataIds.frontEndpoint}","wait_archive":"0s"}`,
      '{}'
    )

    // 2. preparations
    db.prepare(
      `
      INSERT INTO preparations (id, name, created_at, updated_at, delete_after_export, max_size, piece_size, min_piece_size, no_inline, no_dag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      initialDataIds.preparations,
      'example-preparation',
      '2024-12-13T17:30:00Z',
      '2024-12-13T17:30:00Z',
      0,
      null,
      null,
      null,
      0,
      0
    )
    // 3. source_attachments
    db.prepare(
      `
      INSERT INTO source_attachments (id, preparation_id, storage_id)
      VALUES (?, ?, ?)
    `
    ).run(
      initialDataIds.sourceAttachments,
      initialDataIds.preparations,
      initialDataIds.storages
    )
    // 4. jobs
    db.prepare(
      `
      INSERT INTO jobs (id, type, state, error_message, error_stack_trace, worker_id, attachment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      initialDataIds.jobs,
      'example-job',
      'done',
      null,
      null,
      null,
      initialDataIds.sourceAttachments
    )
    // 5. cars (first one)
    db.prepare(
      `
      INSERT INTO cars (id, created_at, piece_type, piece_cid, piece_size, root_cid, file_size, storage_id, storage_path, num_of_files, preparation_id, attachment_id, job_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      initialDataIds.carsFirst,
      '2024-12-13T17:42:23.929936Z',
      '',
      Buffer.from(
        '017112202F55E3B8F9D8B87F388AD76033F5128E65A1A334B9B3E1DAA0154C4DD25394CDBFD48ED1',
        'hex'
      ),
      34359738368,
      Buffer.from(
        '01711220C43D3C6A65291E416BD5455B23FC36AB2FD9893C722AAD37F0A7FA865F05AA2F78',
        'hex'
      ),
      10595821705,
      null,
      '',
      76,
      initialDataIds.preparations,
      initialDataIds.sourceAttachments,
      initialDataIds.jobs
    )
    // 6. directories
    db.prepare(
      `
      INSERT INTO directories (id, cid, name, exported, attachment_id, parent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      initialDataIds.directories,
      Buffer.from(
        '01711220C43D3C6A65291E416BD5455B23FC36AB2FD9893C722AAD37F0A7FA865F05AA2F78',
        'hex'
      ),
      'root',
      0,
      initialDataIds.sourceAttachments,
      null
    )
    // 7. cars (second one, with placeholder CIDs)
    db.prepare(
      `
      INSERT INTO cars (id, created_at, piece_type, piece_cid, piece_size, root_cid, file_size, storage_id, storage_path, num_of_files, preparation_id, attachment_id, job_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      initialDataIds.carsSecond,
      '2024-12-13T17:42:23.929936Z',
      '',
      Buffer.from(
        '01711220AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'hex'
      ),
      1,
      Buffer.from(
        '01711220BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        'hex'
      ),
      1,
      initialDataIds.storages,
      '',
      0,
      initialDataIds.preparations,
      initialDataIds.sourceAttachments,
      null
    )
    // 8. files
    db.prepare(
      `
      INSERT INTO files (id, cid, path, hash, size, last_modified_nano, attachment_id, directory_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      initialDataIds.files,
      Buffer.from(
        '017112204683058D9C2E3516B0933C6B9AA95400D0B5136B316986F9A27D72B706E5D3E3',
        'hex'
      ),
      initialDataIds.filePath,
      '03f41c1eb44caa4f8e55768e6b2fc127',
      2154675,
      1746799656000000000,
      initialDataIds.sourceAttachments,
      initialDataIds.directories
    )
  })()

  return initialDataIds
}

/**
 * @param {import('better-sqlite3').Database} db - The database instance
 * @param {any} initialDataIds
 * @param {CID} cid
 */
export function insertFileEntry(db, initialDataIds, cid) {
  const id = Math.floor(Math.random() * 1_000_000) // Random ID for the example
  db.prepare(
    `
    INSERT INTO files (id, cid, path, hash, size, last_modified_nano, attachment_id, directory_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    cid.bytes,
    initialDataIds.filePath,
    '03f41c1eb44caa4f8e55768e6b2fc127',
    2154675,
    1746799656000000000,
    initialDataIds.sourceAttachments,
    initialDataIds.directories
  )

  return id
}

/**
 * @typedef {object} CarBlockEntry
 * @property {CID} cid - The CID of the block
 * @property {number} carOffset - The offset of the block in the CAR file
 * @property {number} carBlockLength - The length of the block in the CAR file
 * @property {Uint8Array} varint - The varint encoding of the block length
 * @property {Uint8Array | null} rawBlock - The raw block data
 * @property {number} fileOffset - The offset of the block in the file
 * @property {number} carId - The ID of the CAR file
 * @property {number|null} fileId - The ID of the file, or null if not applicable
 */

/**
 * @param {import('better-sqlite3').Database} db - The database instance
 * @param {CarBlockEntry} params
 */
export function insertCarBlockEntry(
  db,
  {
    cid,
    carOffset,
    carBlockLength,
    varint,
    rawBlock,
    fileOffset,
    carId,
    fileId = null,
  }
) {
  getCarBlockStmt(db).run(
    Math.floor(Math.random() * 1_000_000), // Random ID for the example
    cid.bytes,
    carOffset,
    carBlockLength, // Total length of the block + varint length
    varint,
    rawBlock,
    fileOffset,
    carId,
    fileId
  )
}

// car_blocks insertion should be handled within the loop as they are part of the 'entries'
/**
 * @param {import('better-sqlite3').Database} db
 * @returns {import('better-sqlite3').Statement}
 */
export const getCarBlockStmt = (db) =>
  db.prepare(`
  INSERT INTO car_blocks (id, cid, car_offset, car_block_length, varint, raw_block, file_offset, car_id, file_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)
