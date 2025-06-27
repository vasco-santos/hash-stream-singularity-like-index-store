// Streamer
import { HashStreamer } from '@hash-stream/streamer'

// Index
import { IndexReader } from '@hash-stream/index/reader'
import { SingularityLikeIndexStore } from '@hash-stream/singularity-like-index-store'

// Pack
import { PackReader } from '@hash-stream/pack/reader'
import { HTTPPackStore } from '@hash-stream/pack/store/http'

/**
 * @param {object} config - Configuration for the S3 client.
 * @param {URL} config.url - Default URL of the HTTP Pack Store.
 * @param {string[]} config.storageTypes - Storage type to accept. 
 * @param {string} config.storagePathPrefix - Path prefix for stored objects.
 * @param {string} config.dbFilename - Path to the SQLite database file.
 */
export function getHashStreamer(config) {
  const indexStore = new SingularityLikeIndexStore({
    filename: config.dbFilename,
    storageTypes: config.storageTypes,
    storagePathPrefix: config.storagePathPrefix,
  })
  const packStore = new HTTPPackStore({
    url: config.url,
    prefix: '',
    extension: ''
  })

  const indexReader = new IndexReader(indexStore)
  const packReader = new PackReader(packStore)

  return new HashStreamer(indexReader, packReader)
}
