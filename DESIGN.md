# 🧩 Singularity DB as backend for a Hash Stream Index Store

## Overview

This proposal designs a HashStream-backed IndexStore that enables trustless data delivery using Singularity's database. Clients can retrieve and verify data efficiently while the server operates on raw data without additional processing.

## Background

### Singularity

[Singularity](https://github.com/data-preservation-programs/singularity/) is a tool that onboards data to Filecoin without transforming data at rest. It encodes files as UnixFS in memory, maintaining metadata about each block's position within a theoretical CAR file. When a Storage Provider requests data, bytes are read from original files and encoded into CAR format on demand. The database schema that maintains this state is illustrated by this [database diagram](https://raw.githubusercontent.com/data-preservation-programs/singularity/refs/heads/main/docs/database-diagram.svg).

Key database tables:
- `cars` - CAR metadata with piece CIDs
- `car_blocks` - Block CIDs, offsets, and either inline bytes (`raw_block`) or file references (`file_id`)  
- `files` - File paths and metadata
- `storages` - Abstract storage locations (local, S3, etc.)

The main query endpoint `/piece/metadata/${pieceCid}` joins these tables to serve metadata responses ([example](https://singularity.archive.org/piece/metadata/baga6ea4seaqdip263x4wunwfhu3og5jfinbybopn5sa3mib4hyeidzncvq3qqny)).

A `car` entry has a `rootCid` column, but this column is misleading because for the CAR data type, it is simply the CID of the first block of that CAR (`bafk...` CID), not the root of a DAG. The `rootCID` of a DAG is actually set in the `directory` table, corresponding to the attachment between preparation and storage, specifically when `parent_id = null` (i.e., the top-level directory).

While encoding this data using UnixFS, intermediary DAG PB nodes need to be created to maintain the DAG's metadata. Those nodes MAY represent files within the `preparation` directory. The bytes of these blocks are stored inline in the `car_blocks` table, more specifically in the `raw_block` column. All other entries in the `car_blocks` table do not have `raw_block` content, but instead contain a `file_id` as a foreign key to the `files` table. By inspecting the file with the given ID in the `files` table, one can find the path inside the storage, and together with the information from the `car_blocks` entry, one can determine the byte offset and length of the block within the original file.

A `storage` entry is an abstract rclone Fs interface that may be a local directory, S3 bucket, IA item, etc. Therefore, a `storage` is of arbitrary size and can include many CARs for one storage.

The relevant tables in the SQL schema are the following:

```sql
CREATE TABLE IF NOT EXISTS "car_blocks" (
	"id"	integer,
	"cid"	blob,
	"car_offset"	integer,
	"car_block_length"	integer,
	"varint"	blob,
	"raw_block"	blob,
	"file_offset"	integer,
	"car_id"	integer,
	"file_id"	integer,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_car_blocks_car" FOREIGN KEY("car_id") REFERENCES "cars"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_car_blocks_file" FOREIGN KEY("file_id") REFERENCES "files"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "cars" (
	"id"	integer,
	"created_at"	datetime,
	"piece_type"	text,
	"piece_cid"	blob,
	"piece_size"	integer,
	"root_cid"	blob,
	"file_size"	integer,
	"storage_id"	integer,
	"storage_path"	text,
	"num_of_files"	integer,
	"preparation_id"	integer,
	"attachment_id"	integer,
	"job_id"	integer,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_cars_attachment" FOREIGN KEY("attachment_id") REFERENCES "source_attachments"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_cars_job" FOREIGN KEY("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL,
	CONSTRAINT "fk_cars_preparation" FOREIGN KEY("preparation_id") REFERENCES "preparations"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_cars_storage" FOREIGN KEY("storage_id") REFERENCES "storages"("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "files" (
	"id"	integer,
	"cid"	blob,
	"path"	text,
	"hash"	text,
	"size"	integer,
	"last_modified_nano"	integer,
	"attachment_id"	integer,
	"directory_id"	integer,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_files_attachment" FOREIGN KEY("attachment_id") REFERENCES "source_attachments"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_files_directory" FOREIGN KEY("directory_id") REFERENCES "directories"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "storages" (
	"id"	integer,
	"name"	text UNIQUE,
	"created_at"	datetime,
	"updated_at"	datetime,
	"type"	text,
	"path"	text,
	"config"	JSON,
	"client_config"	JSON,
	PRIMARY KEY("id")
);
```

### Hash Stream

[Hash Stream](https://github.com/vasco-santos/hash-stream/tree/main) is a set of building blocks that enables anyone to easily run an off-the-shelf trustless HTTP server for content-addressable data.

One of the most critical building blocks is its IndexReader, which is backed by an IndexStore. Its role is to find known locations for the bytes that hash to a given multihash, so that the server can provide those bytes as a response stream.

The Hash Stream server responses are shaped by the client request and can either be:
- A simple multihash request-response interaction (similar to the Bitswap protocol in IPFS)
- More complex responses, such as commp, blake3, multiblock-responses (e.g., CAR file), etc.

The IndexStore can be backed by any kind of underlying storage or third-party indexing state, provided that it can fulfill the interface to return locations for the bytes to be served.

## Design

Before designing how HashStream can rely on the database of a Singularity instance to serve content, it is important to consider a scenario where this can be used and the kind of expected queries. We can consider `example.com` as the main entry point for someone to navigate through some data collection that was previously processed by Singularity. In this collection, among other files, we have an audio file represented by CID `bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au` when encoded using UnixFS.

Once a request to fetch the bytes behind this CID reaches a HashStream server, it will attempt to find known locations for the bytes to serve via its IndexReader relying on the IndexStore backed by the database of a Singularity instance.

TODO: This is not exactly the case when a root or intermediary node in the DAG - eventually may also return the bytes directlty - To Sync with Riba

The key tables in the Singularity database to find the location of some bytes are:
- The `car_blocks` table, which keeps a record of the CIDs of all blocks inside the preparation CAR and the offset of those blocks within this CAR and the original file. Moreover, if the block was created and its bytes are not present in the original file (e.g., DagPB root node), the block content is stored inline in the `raw_block` column.
- The `files` table, which keeps track of the CID of every file within the encoded directory.

Given that Hash Stream server responses are shaped by the requests, the following sections show how these tables can be used by the IndexStore to find locations for the bytes depending on the request:

### Simple multihash request-response pattern

In this pattern, we consider an IPFS Bitswap-like interaction to fetch the bytes behind a CID `bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au`, which then will follow up with more requests while it traverses the DAG and discovers further CIDs to request.

Once the IndexStore backed by the Singularity database receives this request, it will query the `car_blocks` table for the given CID and get back a record like:

```json
{
  "id": 377351956,
  "cid": "bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au",
  "carOffset": 2154851,
  "carBlockLength": 197,
  "varint": "wwE=",
  "rawBlock": "EiwKJAFVEiD3fXHsfAtzuy4Rs7Bao4IZFk1sp6n7TiW9l6c8Fsd4ZBIAGICAQBIsCiQBVRIgknipVUA6k+D7/at6kJIKw3djt7YFeTtVtexkvTN3gc8SABiAgEASLAokAVUSIGLF/7OZ+6M6WJKEtwumIV6ucqv+G0o2Z3ZQ1CCgJ1ekEgAYs8EDChMIAhizwYMBIICAQCCAgEAgs8ED",
  "fileOffset": 0,
  "carId": 17482,
  "fileId": null
},
```

TODO: Represent how indexStore returns this... To sync with Riba

```json
{
	
}
```

The `rawBlock` content should be the byte representation that hashes to the given CID. Therefore, its content can be streamed back by HashStream to the client.

Once the client verifies and decodes the block, it MAY intend to traverse the DAG and request following blocks from the server. For instance, a follow-up request MAY be performed with CID `bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq`. When this request reaches the IndexStore, it queries the Singularity database on the `car_blocks` table, getting the following record:

```json
{
  "id": 377351953,
  "cid": "bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq",
  "carOffset": 59,
  "carBlockLength": 1048615,
  "varint": "pIBA",
  "rawBlock": null,
  "fileOffset": 0,
  "carId": 17482,
  "fileId": 2085318
}
```

In this case, the `rawBlock` entry is null. However, it points to the `fileId` **2085318**, which can be obtained by querying the file record from the `files` table:

```json
{
  "id": 2085318,
  "cid": "bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au",
  "path": "001-Al-Fatihah.mp3",
  "hash": "03f41c1eb44caa4f8e55768e6b2fc127",
  "size": 2154675,
  "lastModifiedNano": 1746799656000000000,
  "attachmentId": 590,
  "directoryId": 18042
}
```

Note that both queries can be made with a single query using a JOIN with `fileId`, but for simplicity reasons we illustrate them here separately.

With both of these entries, one can infer a location for the bytes that hash to `bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq`. The location is not only a path in some store, but also a byte range, given that some files may be chunked into several blocks.

Its path can be obtained from the `path` column in the `file` row: **"001-Al-Fatihah.mp3"**. However, the byte range where the bytes that hash to the requested CID live within the file needs to be [calculated as follows](https://github.com/data-preservation-programs/singularity/blob/2ba632599cb3552075e1a228197cded80ab6198b/model/preparation.go#L316):

```go
blockLength = carBlockLength - len(cid.Bytes()) - len(varint)
```

Starting by decoding the `varint` from the `car_blocks` row:

```sh
$ echo 'pIBA' | base64 -d | hexdump -C
00000000  a4 80 40 
```

Therefore:
- `varint = [0xa4, 0x80, 0x40]`
- `len(varint) = 3`

Afterwards, we need to verify how many bytes are needed to encode the CID:
- `1 (CIDv1) + 1 (codec) + 1 (hash fn) + 1 (length) + 32 (digest) = 36 bytes`

```go
blockLength = carBlockLength - len(cid) - len(varint)
blockLength = 1048615 - 36 - 3
blockLength = 1048576
```

Finally, an index record can be returned as follows for serving the content: 

```json
{
	// MultihashDigest identifying the record
  "multihash": "MH(bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq)",
  // Type of the record
  "type": "BLOB",
  // hash digest of the location or Path
  "location": "/001-Al-Fatihah.mp3",
  // length of the data
  "length": 1048576,
  // offset of the data in the location byte stream
  "offset": 0
}
```

Afterwards, the client will request one more block while traversing the DAG. When this request reaches the IndexStore, it queries the Singularity database on the `car_blocks` table, getting the following record:

```json
{
  "id": 377351954,
  "cid": "bafkreiespcuvkqb2spqpx7nlpkijecwdo5r3pnqfpe5vlnpmms6tg54bz4",
  "carOffset": 1048674,
  "carBlockLength": 1048615,
  "varint": "pIBA",
  "rawBlock": null,
  "fileOffset": 1048576,
  "carId": 17482,
  "fileId": 2085318
}
```

Like the previous block, it will also query the `files` table, getting the following result:

```json
{
  "id": 2085318,
  "cid": "bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au",
  "path": "001-Al-Fatihah.mp3",
  "hash": "03f41c1eb44caa4f8e55768e6b2fc127",
  "size": 2154675,
  "lastModifiedNano": 1746799656000000000,
  "attachmentId": 590,
  "directoryId": 18042
}
```

The block length and the path are exactly the same as the previous item. The difference is the `offset` where it starts this time. Therefore, the following Index Record can be yielded for HashStream server to serve the bytes:

```json
{
	// MultihashDigest identifying the record
  "multihash": "MH(bafkreiespcuvkqb2spqpx7nlpkijecwdo5r3pnqfpe5vlnpmms6tg54bz4)",
  // Type of the record
  "type": "BLOB",
  // hash digest of the location or Path
  "location": "/001-Al-Fatihah.mp3",
  // length of the data
  "length": 1048576,
  // offset of the data in the location byte stream
  "offset": 1048576
}
```

Finally, the client will request the very last block to finalize traversing the DAG, i.e., the block with CID `bafkreidcyx73hgp3um5freuew4f2mik6vzzkx7q3ji3go5sq2qqkaj2xuq`. When this request reaches the IndexStore, it queries the Singularity database on the `car_blocks` table, getting the following record:

```json
{
	"id": 377351955,
	"cid": "bafkreidcyx73hgp3um5freuew4f2mik6vzzkx7q3ji3go5sq2qqkaj2xuq",
	"carOffset": 2097289,
	"carBlockLength": 57562,
	"varint": "18ED",
	"rawBlock": null,
	"fileOffset": 2097152,
	"carId": 17482,
	"fileId": 2085318
}
```

Like the previous block, it will also query the `files` table, getting the following result:

```json
{
  "id": 2085318,
  "cid": "bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au",
  "path": "001-Al-Fatihah.mp3",
  "hash": "03f41c1eb44caa4f8e55768e6b2fc127",
  "size": 2154675,
  "lastModifiedNano": 1746799656000000000,
  "attachmentId": 590,
  "directoryId": 18042
}
```

The byte range where the bytes that hash to the requested CID live within the file needs to be calculated as follows:

```go
blockLength = carBlockLength - len(cid.Bytes()) - len(varint)
```

Starting by decoding the `varint` from the `car_blocks` row:

```sh
$ echo '18ED' | base64 -d | hexdump -C
00000000  d7 c1 0d 
```

Therefore:
- `varint = [0xd7, 0xc1, 0x0d]`
- `len(varint) = 3`

Afterwards, we need to verify how many bytes are needed to encode the CID:
- `1 (CIDv1) + 1 (codec) + 1 (hash fn) + 1 (length) + 32 (digest) = 36 bytes`

```go
blockLength = carBlockLength - len(cid) - len(varint)
blockLength = 57562 - 36 - 3
blockLength = 57523
```

Finally, the very last Index Record is yielded to have the server to stream the content: 

```json
{
	// MultihashDigest identifying the record
  "multihash": "MH(bafkreidcyx73hgp3um5freuew4f2mik6vzzkx7q3ji3go5sq2qqkaj2xuq)",
  // Type of the record
  "type": "BLOB",
  // hash digest of the location or Path
  "location": "/001-Al-Fatihah.mp3",
  // length of the data
  "length": 57523,
  // offset of the data in the location byte stream
  "offset": 2097152
}
```

### More complex response pattern

In this pattern, we consider a more complex response where all the blocks that are part of the DAG behind a given CID are streamed right away. Let's consider the same CID as in the previous case: `bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au`.

Once the IndexStore backed by the Singularity database receives this request to find all the blocks that have some relationship to create the DAG with CID `bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au`, it can query the `car_blocks` table as previously, obtaining the exact same record: 

```json
{
  "id": 377351956,
  "cid": "bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au",
  "carOffset": 2154851,
  "carBlockLength": 197,
  "varint": "wwE=",
  "rawBlock": "EiwKJAFVEiD3fXHsfAtzuy4Rs7Bao4IZFk1sp6n7TiW9l6c8Fsd4ZBIAGICAQBIsCiQBVRIgknipVUA6k+D7/at6kJIKw3djt7YFeTtVtexkvTN3gc8SABiAgEASLAokAVUSIGLF/7OZ+6M6WJKEtwumIV6ucqv+G0o2Z3ZQ1CCgJ1ekEgAYs8EDChMIAhizwYMBIICAQCCAgEAgs8ED",
  "fileOffset": 0,
  "carId": 17482,
  "fileId": null
}
```

The reader can already yield this like previously as:

TODO: Same as before, needs alignment because IndexReader usually expects location, not the bytes already...

```json
{

}
```

However, instead of stopping as in the previous `request-response pattern`, it will try to find further records. For this, it will query the `files` table now with the exact same CID, joining the results with the `car_blocks` entries on the `file_id` of the file found, resulting in the following records:

- File record (separated for ease of illustration):

```json
{
	"id": 2085318,
	"cid": "bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au",
	"path": "001-Al-Fatihah.mp3",
	"hash": "03f41c1eb44caa4f8e55768e6b2fc127",
	"size": 2154675,
	"lastModifiedNano": 1746799656000000000,
	"attachmentId": 590,
	"directoryId": 18042
}
```

- Blocks:

```json
[
	{
		"id": 377351953,
		"cid": "bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq",
		"carOffset": 59,
		"carBlockLength": 1048615,
		"varint": "pIBA",
		"rawBlock": null,
		"fileOffset": 0,
		"carId": 17482,
		"fileId": 2085318
	},
	{
		"id": 377351954,
		"cid": "bafkreiespcuvkqb2spqpx7nlpkijecwdo5r3pnqfpe5vlnpmms6tg54bz4",
		"carOffset": 1048674,
		"carBlockLength": 1048615,
		"varint": "pIBA",
		"rawBlock": null,
		"fileOffset": 1048576,
		"carId": 17482,
		"fileId": 2085318
	},
	{
		"id": 377351955,
		"cid": "bafkreidcyx73hgp3um5freuew4f2mik6vzzkx7q3ji3go5sq2qqkaj2xuq",
		"carOffset": 2097289,
		"carBlockLength": 57562,
		"varint": "18ED",
		"rawBlock": null,
		"fileOffset": 2097152,
		"carId": 17482,
		"fileId": 2085318
	}
]
```

Finally, these index records are also yielded to the server to fetch the bytes and stream them to the client:

```json
[
	{
		// MultihashDigest identifying the record
		"multihash": "MH(bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq)",
		// Type of the record
		"type": "BLOB",
		// hash digest of the location or Path
		"location": "/001-Al-Fatihah.mp3",
		// length of the data
		"length": 1048576,
		// offset of the data in the location byte stream
		"offset": 0
	},
	{
		// MultihashDigest identifying the record
		"multihash": "MH(bafkreiespcuvkqb2spqpx7nlpkijecwdo5r3pnqfpe5vlnpmms6tg54bz4)",
		// Type of the record
		"type": "BLOB",
		// hash digest of the location or Path
		"location": "/001-Al-Fatihah.mp3",
		// length of the data
		"length": 1048576,
		// offset of the data in the location byte stream
		"offset": 1048576
	},
	{
		// MultihashDigest identifying the record
		"multihash": "MH(bafkreidcyx73hgp3um5freuew4f2mik6vzzkx7q3ji3go5sq2qqkaj2xuq)",
		// Type of the record
		"type": "BLOB",
		// hash digest of the location or Path
		"location": "/001-Al-Fatihah.mp3",
		// length of the data
		"length": 57523,
		// offset of the data in the location byte stream
		"offset": 2097152
	}
]
```

### Future optimizations

The IndexStore relies on `multihashes`, while Singularity's Database relies on CIDs that may have `raw` or `dag-pb` multicodecs. Therefore, the first characters of the CID in the table will be `bafyb` or `bafkr`. Either queries need to take this into account, or multiple queries may be needed. There are multiple options, such as:

1. **Table updated with new column** to have only the necessary suffix in place, and an index for this column is created
2. **IndexStore needs to try out first one option** (for example `raw` encoded multihash) and fallback to try the other multicodec afterwards
3. **IndexStore queries with `substr`** to avoid the second query, but the loss of index efficiency is arguably worse than trying the most common multicodecs first

For the first implementation, this IndexStore implementation will rely on the second option. This MAY be revisited later.

## Follow ups

- Define how Index Reader/Store handle inline raw blocks, rather than location itself.
	- TODO: Figure out with Riba
- How does exact location is known. Currently with Files, we have the path within some collection, however in previous old singularity link, we could rely on table `storages`, more specifically in `storage.endpoint` as something like `https://s3.us.example.com` and `storage.path` to get something like `https://s3.us.example.com/collection-name/`, which would then have the path appended. Considering there is a well known endpoint for all the content, it can be used while instantiating the store (for instance `https://s3.us.example.com`). However, looks like a path for the storage would still be required?
	- TODO: Figure out with Arkadiy
