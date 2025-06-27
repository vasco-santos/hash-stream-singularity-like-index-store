# HashStream server backed by singularity like store

## Getting Started

### Install dependencies

```sh
pnpm install
```

### Run server in one terminal

In the example folder one can run: 

```sh
npm run dev -- --store-url='https://archive.org' --db-path='./fixtures/test.db' --storage-types='internetarchive' --storage-path-prefix='download'
```

The `--store-url` is responsible for setting a store URL behind the [`HTTPPackStore`](https://github.com/vasco-santos/hash-stream/blob/main/packages/pack/src/store/http.js). It is worth noting that in case the `storages` entry has a `config.front_endpoint`, it will replace the configured URL.

The `--db-path` has a path to a Database with the Singularity schema in disk. Later on, a remote Database should also be supported.

The `--storage-types` aims to guarantee compatibility between this store and preparations from Singularity, given `storages` may have different configurations that need to be handled. One of them can be `internetarchive` by the fixtures in this repo.

The `--storage-path-prefix` enables configuring a top level path when fetching records.

### How does the server look like

The code is available in `src/lib.js` for it. It simply plus pieces to have a HashStream server ready to serve requests:

```js
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
```

The `/src/index.js` makes HashStreamer be used as a server to respond to `/ipfs/*` HTTP requests following the IPFS Trustless gateway spec.

## Test with Fixture data

In this section we test the running HashStream server with a real prepared Database. Make sure to have a terminal running the server: 

```sh
npm run dev -- --store-url='https://archive.org' --db-path='./fixtures/test.db' --storage-types='internetarchive' --storage-path-prefix='download'

> @hash-stream/singularity-like-index-store-example@0.0.0 dev
> node src/index.js --store-url=https://archive.org --db-path=./fixtures/test.db --storage-types=internetarchive --storage-path-prefix=download

dbPath ./fixtures/test.db
resolvedDbPath /Users/vcs/work/github/hash-stream-singularity-like-store/example/fixtures/test.db
Listening on http://localhost:3000
Hash Stream PackStore URL: https://archive.org/
Hash Stream IndexStore DB Path: /Users/vcs/work/github/hash-stream-singularity-like-store/example/fixtures/test.db
Hash Stream IndexStore Path Prefix: download
Hash Stream IndexStore Storage Types: internetarchive
```

### Create a Database with a fixture JSON file

From the main folder of this repository, one can run a script to create a Singularity like database from a JSON response like https://singularity.archive.org/piece/metadata/baga6ea4seaqi4yjxkjwftqkblnfuallnsssvrgfijff65gnprqcd5p2ba7dhemy. 

For convenience, we have a file available in this repository in `/example/fixtures/baga6ea4seaqi4yjxkjwftqkblnfuallnsssvrgfijff65gnprqcd5p2ba7dhemy.json` that one can rely on:

```sh
$ node example/scripts/create-db.js --db-path=./test.db --json-path=./example/fixtures/baga6ea4seaqi4yjxkjwftqkblnfuallnsssvrgfijff65gnprqcd5p2ba7dhemy.json

Database path: /Users/vcs/work/github/hash-stream-singularity-like-store/test.db
JSON path: /Users/vcs/work/github/hash-stream-singularity-like-store/example/fixtures/baga6ea4seaqi4yjxkjwftqkblnfuallnsssvrgfijff65gnprqcd5p2ba7dhemy.json
Data inserted successfully
Test database created at: /Users/vcs/work/github/hash-stream-singularity-like-store/test.db
```

### List files and blocks within each file to facilitate queries

From the main folder of this repository, one can run a script to list files and blocks within a file based on the fixture JSON file used.

```sh
$ node example/scripts/list-file-and-block-cids.js --json-path=./example/fixtures/baga6ea4seaqi4yjxkjwftqkblnfuallnsssvrgfijff65gnprqcd5p2ba7dhemy.json --output-path=./output.json

JSON input: /Users/vcs/work/github/hash-stream-singularity-like-store/example/fixtures/baga6ea4seaqi4yjxkjwftqkblnfuallnsssvrgfijff65gnprqcd5p2ba7dhemy.json
JSON output: /Users/vcs/work/github/hash-stream-singularity-like-store/output.json
Output written to /Users/vcs/work/github/hash-stream-singularity-like-store/output.json
```

### Download Raw content File as CAR

We can pick from `output.json` a RAW CID for a file `bafkreigzcnxjfwnu2gonjdak3u53u3lpfknufzf5eor7vt4kdkpu6afhhi` and attempt to download its block as a CAR file.

```sh
wget http://localhost:3000/ipfs/bafkreigzcnxjfwnu2gonjdak3u53u3lpfknufzf5eor7vt4kdkpu6afhhi?format=car

ipfs-car unpack bafkreigzcnxjfwnu2gonjdak3u53u3lpfknufzf5eor7vt4kdkpu6afhhi.car --output 200411_Mode_Art_Can_1482_R3_master.intros_000009.jpg --verify

open 200411_Mode_Art_Can_1482_R3_master.intros_000009.jpg
```

Looking at the server terminal one can see following wired logs:

```sh
Relevant Index Record fields: {
  type: 0,
  location: 'https://archive.org/download/200411_Mode-Art_Can_1482_R3/200411_Mode-Art_Can_1482_R3.thumbs/200411_Mode_Art_Can_1482_R3_master.intros_000009.jpg',
  length: 31543,
  offset: 0
}
Pack Record raw multihash fetched: CID(bafkreigzcnxjfwnu2gonjdak3u53u3lpfknufzf5eor7vt4kdkpu6afhhi)
```

We can compare the output with the `outputs.json` previously generated and confirm only one block is expected to be fetched. One can also download the direct content from the location and compare it with the fetched data.

### Download DagPB content as CAR

```sh
wget http://localhost:3000/ipfs/bafybeiduqr2463vs62imbqmnrimhva5p4ljg6cp3u72fm3jikgkffbofqi?format=car

ipfs-car unpack bafybeiduqr2463vs62imbqmnrimhva5p4ljg6cp3u72fm3jikgkffbofqi.car --output 200411_Mode_Art_Can_1482_R3_master.intros.mp4 --verify

open 200411_Mode_Art_Can_1482_R3_master.intros.mp4
```

Looking at the server terminal one can see following wired logs:

```sh
Relevant Index Record fields: {
  type: 3,
  location: Digest {},
  length: 209,
  offset: 0
}
Pack Record raw multihash fetched: CID(bafkreiduqr2463vs62imbqmnrimhva5p4ljg6cp3u72fm3jikgkffbofqi)
Relevant Index Record fields: {
  type: 0,
  location: 'https://archive.org/download/200411_Mode-Art_Can_1482_R3/200411_Mode_Art_Can_1482_R3_master.intros.mp4',
  length: 1048576,
  offset: 0
}
Pack Record raw multihash fetched: CID(bafkreidnw5wyvpyfmvqzbweha53pje24vljagv6ib5xkyboxlno5ddqtfa)
Relevant Index Record fields: {
  type: 0,
  location: 'https://archive.org/download/200411_Mode-Art_Can_1482_R3/200411_Mode_Art_Can_1482_R3_master.intros.mp4',
  length: 1048576,
  offset: 1048576
}
Pack Record raw multihash fetched: CID(bafkreiaernta5yu6anf4xdqotfttiky5yyz7nxpi6qmqimmhefovejzf74)
Relevant Index Record fields: {
  type: 0,
  location: 'https://archive.org/download/200411_Mode-Art_Can_1482_R3/200411_Mode_Art_Can_1482_R3_master.intros.mp4',
  length: 1048576,
  offset: 2097152
}
Pack Record raw multihash fetched: CID(bafkreibojm2nkvcefyvkrwmxcrqpjrdrab3temihsl2jlu2ddcujbop42a)
Relevant Index Record fields: {
  type: 0,
  location: 'https://archive.org/download/200411_Mode-Art_Can_1482_R3/200411_Mode_Art_Can_1482_R3_master.intros.mp4',
  length: 194817,
  offset: 3145728
}
Pack Record raw multihash fetched: CID(bafkreihwx27ebxhujq4d72jm36ezrbtepxixdfkajpvpcel5wtcohba4ti)
```

We can compare the output with the `outputs.json` previously generated and confirm the expected blocks. Moreover, one can look at the fixture used to generate the DB to even calculate and confirm expected lengths and offsets match. The particular case here is that the location of the first block is an inline identity multihash with the block encoded, given this piece of content is the actual DAG PB block that is not available as part of the raw data.

### Download with @helia/verified-fetch

`@helia/verified-fetch` enables one to download and verify on the go content addressable data like the responses from HashStream (block by block at the time of writing).

One can write a simple client tester to interact with the server to obtain the same results as above:

```js
import fs from "fs"

import { createVerifiedFetch } from "@helia/verified-fetch"
import { CID } from "multiformats/cid"

const serverUrl = "http://localhost:3000"
const cidString = "bafybeiduqr2463vs62imbqmnrimhva5p4ljg6cp3u72fm3jikgkffbofqi"

const cid = CID.parse(cidString)
const verifiedFetch = await createVerifiedFetch({
  gateways: [serverUrl],
  allowLocal: true
})
const response = await verifiedFetch(`ipfs://${cid}/`)
const body = await response.arrayBuffer()
const bodyBytes = new Uint8Array(body)
await fs.promises.writeFile(
  `./${cid.toString()}.mov`,
  Buffer.from(bodyBytes)
)
```

One can again see the server logs as in previous direct HTTP Request.
