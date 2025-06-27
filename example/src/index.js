/* global process console */

import { CID } from 'multiformats/cid'
import { code as rawCode } from 'multiformats/codecs/raw'

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { http } from '@hash-stream/utils/trustless-ipfs-gateway'

import { getHashStreamer } from './lib.js'
import path from 'path'
import fs from 'fs'

// Parse CLI args
const args = process.argv.slice(2)

const portArg = args.find((arg) => arg.startsWith('--port='))
const port = portArg ? parseInt(portArg.split('=')[1], 10) : 3000

// Store URL argument
const storeUrlArg = args.find((arg) => arg.startsWith('--store-url='))
let url
try {
  url = storeUrlArg ? new URL(storeUrlArg.split('=')[1]) : undefined
} catch (error) {
  console.error('Error parsing --store-url argument:', error.message)
  process.exit(1)
}

if (!url) {
  console.error('Error: --store-url argument is required')
  process.exit(1)
}

// DB path argument
const dbArg = args.find((arg) => arg.startsWith('--db-path='))
const dbPath = dbArg ? dbArg.split('=')[1] : undefined
console.log('dbPath', dbPath)

if (!dbPath) {
  console.error('Error: --db-path argument is required')
  process.exit(1)
}

// Resolve dbPath to absolute if it's relative
const resolvedDbPath = path.isAbsolute(dbPath)
  ? dbPath
  : path.resolve(process.cwd(), dbPath)
console.log('resolvedDbPath', resolvedDbPath)

// Check if the dbPath exists
if (!fs.existsSync(resolvedDbPath)) {
  console.error(
    `Error: Directory for --db-path does not exist: ${resolvedDbPath}`
  )
  process.exit(1)
}

// Storage path prefix argument
const storagePathPrefixArg = args.find((arg) =>
  arg.startsWith('--storage-path-prefix=')
)
const storagePathPrefix = storagePathPrefixArg
  ? storagePathPrefixArg.split('=')[1]
  : ''

// Storage types argument
const storageTypesArg = args.find((arg) => arg.startsWith('--storage-types='))
const storageTypes = storageTypesArg
  ? storageTypesArg.split('=')[1].split(',')
  : []

if (storageTypes.length === 0) {
  console.error(
    'Error: --storage-types argument is required and must not be empty'
  )
  process.exit(1)
}

// const pathArg = args.find((arg) => arg.startsWith('--store-path='))
// const hashStreamPath = pathArg ? pathArg.split('=')[1] : '~/.hash-stream-server'

const app = createApp({
  url,
  storageTypes,
  storagePathPrefix,
  dbFilename: resolvedDbPath,
}).app

if (process.env.NODE_ENV !== 'test') {
  serve(
    {
      fetch: app.fetch,
      port,
      hostname: '0.0.0.0',
    },
    (info) => {
      console.log(`Listening on http://localhost:${info.port}`) // Listening on http://localhost:3000
      console.log(`Hash Stream PackStore URL: ${url}`)
      console.log(`Hash Stream IndexStore DB Path: ${resolvedDbPath}`)
      console.log(`Hash Stream IndexStore Path Prefix: ${storagePathPrefix}`)
      console.log(`Hash Stream IndexStore Storage Types: ${storageTypes}`)
    }
  )
}

/**
 * @typedef {object} Config
 * @property {URL} url - Default URL of the HTTP Pack Store.
 * @property {string[]} storageTypes - Storage type to accept.
 * @property {string} storagePathPrefix - Path prefix for stored objects.
 * @property {string} dbFilename - Path to the SQLite database file.
 */

/**
 * Creates a Hono app configured with a specific hash stream path
 *
 * @param {Config} config - Configuration for the S3 client.
 * @returns {{ app: Hono, config: Config }}
 */
export function createApp(config) {
  const app = new Hono()

  app.get('/ipfs/:cid', async (c) => {
    const hashStreamer = getHashStreamer(config)
    return http.ipfsGet(
      c.req.raw,
      { hashStreamer },
      {
        onIndexRecord: (record) => {
          console.log('Relevant Index Record fields:', {
            type: record.type,
            location: record.location,
            length: record.length,
            offset: record.offset,
          })
        },
        onPackRead: (record) => {
          console.log(
            'Pack Record raw multihash fetched:',
            CID.createV1(rawCode, record)
          )
        },
      }
    )
  })

  return { app, config }
}
