# @hash-stream/singularity-like-index-store

[`hash-stream`](https://github.com/vasco-santos/hash-stream/) defines a set of modular building blocks designed in a plug-and-play fashion, enabling one to use a subset of them to create a custom server, or even build new blocks that fit the defined interfaces to plug with existing ones.

This module provies a HashStream-backed [IndexStore](https://vasco-santos.github.io/hash-stream/specs/) that enables trustless data delivery using [Singularity](https://github.com/data-preservation-programs/singularity)'s database. Clients can retrieve and verify data efficiently while the server operates on raw data without additional processing that was previously ingested by Singularity.

The design document for this module can be found in [Design.md](./DESIGN.md).

## Install

```sh
npm install @hash-stream/index
```

## Usage

The `SingularityLikeIndexStore` allows you to query a SQLite database (populated by Singularity's ingestion process) to find index records associated with a given multihash digest. These records provide information about the location of data (**inline blob** or **external blob**).

### Index Store atomic usage

First, you'll need to set up a SQLite database file and ensure it's populated with data from Singularity. Then, you can query it using the get method.

```js
import { SingularityLikeIndexStore } from '@hash-stream/singularity-like-index-store'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'
import { equals } from 'uint8arrays/equals' // A utility to compare Uint8Arrays

// --- Setup: Assuming you have a SQLite database file ---
// For a real application, replace 'path/to/your/singularity.db'
// with the actual path to your database file.
// In a test environment, you might create a temporary database.
const dbFilename = './your-singularity.db' // Example database file

// For demonstration, let's create a dummy multihash digest.
// In a real scenario, this would come from your application's needs.
// This example uses a multihash for the string "hello world"
async function getExampleMultihash() {
  const text = new TextEncoder().encode("hello world")
  const digest = await sha256.digest(text)
  // The MultihashDigest is the raw hash bytes prefixed with its multihash code.
  // For 'raw' codec, the data itself is the block.
  // For 'dag-pb', it's a protobuf wrapper.
  return digest
}

async function runExample() {
  const exampleMultihash = await getExampleMultihash()

  // 1. Initialize the IndexStore
  const indexStore = new SingularityLikeIndexStore({
    filename: dbFilename,
    storageTypes: ['example.com', 'another.storage.type'], // Configure accepted storage types
    storagePathPrefix: 'download', // Optional: prefix for external storage paths
    // cidCodes: [raw.code, 0x70] // Optional: default to raw (0x55) and dag-pb (0x70)
  })

  console.log(`Querying for multihash: ${CID.createV1(0x55, exampleMultihash).toString()}`)

  // 2. Query the store using the get method (returns an AsyncIterable)
  let foundRecords = 0
  for await (const record of indexStore.get(exampleMultihash)) {
    foundRecords++
    console.log(`--- Found Index Record ${foundRecords} ---`)
    console.log('Type:', record.type)
    console.log('Length:', record.length)
    console.log('Offset:', record.offset)

    // Location will be different based on record type
    if (record.type === 'inline-blob') {
      // For INLINE_BLOB, location is an identity multihash of the inline data
      console.log('Location (Inline Multihash):', record.location.digest)
      // To get the actual inline data, you'd need to fetch the block
      // by its multihash (record.location) from the database where raw_block was stored.
      // (This example does not show fetching the raw_block directly from the DB here)
    } else if (record.type === 'blob') {
      // For BLOB, location is a URL for external fetching
      console.log('Location (URL):', record.location)
      // http://example.com/download/storage-path/file-path
    }
  }

  if (foundRecords === 0) {
    console.log('No index records found for the given multihash.')
  }
}

runExample().catch(console.error)
```

### Index Store usage in HashStream

See the [Example](./example/README.md).

## API

### `class SingularityLikeIndexStore`

A class that implements the `IndexStoreReader` interface from `@hash-stream/index/types` (as defined in [Index Spec](https://vasco-santos.github.io/hash-stream/specs/)) to query a SQLite database populated by Singularity.

#### Create a new IndexStore instance

Initializes a new `SingularityLikeIndexStore` instance.

```js
const indexStore = new SingularityLikeIndexStore(params)
```

Parameters:
- `filename` (`string`): Path to the SQLite database file.
- `storageTypes` (`string[]`): Allowed storage types (e.g. example.com).
- `storagePathPrefix` (`string`): Path prefix inside storage (optional).
- `cidCodes` (`number[]`): Array of CID codec codes to try when querying (optional, defaults to raw and dag-pb).

#### Get known Index Records

Retrieves index records associated with a given multihash digest. This method returns an AsyncIterable, allowing you to process results asynchronously as they become available.

```js
for await (const record of indexStore.get(cid.multihash)) {
  console.log(record)
}
```

Parameters:
- `multihash` (`MultihashDigest`): The multihash to query.

Yields an async iterable of IndexRecord with:
- `multihash`
- `type` (`BLOB` or `INLINE_BLOB`)
- `location` (URL or identity hash)
- `length` (number)
- `offset` (number)
- `subRecords` (empty array for this implementation)

## Contributing

Feel free to join in. All welcome. Please [open an issue](https://github.com/vasco-santos/hash-stream-singularity-like-index-store/issues)!

## License

Dual-licensed under [MIT + Apache 2.0](https://github.com/vasco-santos/hash-stream-singularity-like-index-store/blob/main/license.md)
