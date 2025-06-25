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

A `storage` entry is an abstract rclone Fs interface that may be a local directory, S3 bucket, IA item, etc. Therefore, a `storage` is of arbitrary size and can include many CARs for one storage. Storage entries in the Database SHOULD be of previously configured type (e.g. `example.com`), have a path column (e.g. `foo`) and a configuration column as a JSON (e.g. `{ "front_endpoint": "https://example.com" }`).

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

The key tables in the Singularity database to find the location of some bytes are:
- The `car_blocks` table, which keeps a record of the CIDs of all blocks inside the preparation CAR and the offset of those blocks within this CAR and the original file. Moreover, if the block was created and its bytes are not present in the original file (e.g., DagPB root node), the block content is stored inline in the `raw_block` column.
- The `files` table, which keeps track of the CID of every file within the encoded directory.
- The `storages` table, which keeps track of configuration to HTTP location of the file.

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

That can be transformed to a compatible **IndexRecord** format from HashStream:

```json
{
	"multihash": "MH(bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au)",
  // Type of the record - Inline Blob
  "type": 4,
  // identity multihash with inline raw block content
  "location": "MH(EiwKJAFVEiD3fXHsfAtzuy4Rs7Bao4IZFk1sp6n7TiW9l6c8Fsd4ZBIAGICAQBIsCiQBVRIgknipVUA6k+D7/at6kJIKw3djt7YFeTtVtexkvTN3gc8SABiAgEASLAokAVUSIGLF/7OZ+6M6WJKEtwumIV6ucqv+G0o2Z3ZQ1CCgJ1ekEgAYs8EDChMIAhizwYMBIICAQCCAgEAgs8ED)",
	// length of the data
	"length": 159,
	// offset of the data in the location byte stream
  "offset": 0,
	// associated records
	"subRecords": []
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

Moreover, the `storage` endpoint of this `file` is required in order to know where to read it from. Therefore, a Database query to read it from `storages` is needed, by joining it with the `cars` table using the `carId`. We get the following `storage` entry:

```json
{
	"id": 400,
	"name": "foo",
	"createdAt": "2024-12-13T17:37:44.703659Z",
	"updatedAt": "2024-12-13T17:37:44.703659Z",
	"type": "example.com",
	"path": "foo",
	"config": {
		"disable_checksum": "true",
		"encoding": "Slash,LtGt,CrLf,Del,Ctl,InvalidUtf8,Dot",
		"endpoint": "https://s3.us.example.com",
		"front_endpoint": "https://example.com",
		"wait_archive": "0s"
	},
	"clientConfig": {}
},
```

Note that the above queries can be made with a single query using a JOIN with `fileId`, but for simplicity reasons we illustrate them above separately. An example query to get all this information in one request can be found in the [Database Queries section](#database-queries).

With all of these entries, one can infer a location for the bytes that hash to `bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq`. The location is not only a path in some store, but also a byte range, given that some files may be chunked into several blocks.

Starting by the location of the file, one needs to concatenate several column values. This MAY be implementation detail and should be configurable. One example can be:

```go
location = storage_config.front_endpoint + '/download/' + storage_config.path + `/` + file_path
```

Therefore, the location in this example would be: `https://example.com/download/foo/001-Al-Fatihah.mp3`

The byte range where the bytes that hash to the requested CID live within the file needs to be [calculated as follows](https://github.com/data-preservation-programs/singularity/blob/2ba632599cb3552075e1a228197cded80ab6198b/model/preparation.go#L316):

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
  "location": "https://example.com/download/foo/001-Al-Fatihah.mp3",
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

Like the previous block, it will also query the `files` table, getting the exact same file. The block length and the location are exactly the same as the previous item. The only difference is the `offset` where it starts this time. Therefore, the following Index Record can be yielded for HashStream server to serve the bytes:

```json
{
	// MultihashDigest identifying the record
  "multihash": "MH(bafkreiespcuvkqb2spqpx7nlpkijecwdo5r3pnqfpe5vlnpmms6tg54bz4)",
  // Type of the record
  "type": "BLOB",
  // hash digest of the location or Path
  "location": "https://example.com/download/foo/001-Al-Fatihah.mp3",
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

Like the previous block, it will also query the `files` table, getting the same file, and therefore location.

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
  "location": "https://example.com/download/foo/001-Al-Fatihah.mp3",
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

```json
{
	"multihash": "MH(bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au)",
  // Type of the record - Inline Blob
  "type": 4,
  // identity multihash with inline raw block content
  "location": "MH(EiwKJAFVEiD3fXHsfAtzuy4Rs7Bao4IZFk1sp6n7TiW9l6c8Fsd4ZBIAGICAQBIsCiQBVRIgknipVUA6k+D7/at6kJIKw3djt7YFeTtVtexkvTN3gc8SABiAgEASLAokAVUSIGLF/7OZ+6M6WJKEtwumIV6ucqv+G0o2Z3ZQ1CCgJ1ekEgAYs8EDChMIAhizwYMBIICAQCCAgEAgs8ED)",
	// length of the data
	"length": 158,
	// offset of the data in the location byte stream
  "offset": 0,
	// associated records
	"subRecords": []
}
```

However, instead of stopping as in the previous `request-response pattern`, it will try to find further records. For this, it will query the `files` table now with the exact same CID, joining the results with the `car_blocks` entries on the `file_id` of the file found, as well as the `cars` and `storages` tables, resulting in the following records:

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

- Storage:

```json
{
	"id": 400,
	"name": "foo",
	"createdAt": "2024-12-13T17:37:44.703659Z",
	"updatedAt": "2024-12-13T17:37:44.703659Z",
	"type": "example.com",
	"path": "foo",
	"config": {
		"disable_checksum": "true",
		"encoding": "Slash,LtGt,CrLf,Del,Ctl,InvalidUtf8,Dot",
		"endpoint": "https://s3.us.example.com",
		"front_endpoint": "https://example.com",
		"wait_archive": "0s"
	},
	"clientConfig": {}
},
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
		"location": "https://example.com/download/foo/001-Al-Fatihah.mp3",
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
		"location": "https://example.com/download/foo/001-Al-Fatihah.mp3",
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
		"location": "https://example.com/download/foo/001-Al-Fatihah.mp3",
		// length of the data
		"length": 57523,
		// offset of the data in the location byte stream
		"offset": 2097152
	}
]
```

## Relevant details

### Database Queries

These SQL queries are used to retrieve index records for a given CID from a **Singularity-like SQLite database schema**. They serve as the basis for constructing byte range references to content stored simulating CAR files within object storage.

#### 🔍 Entry Points

There are two primary entry points to query records:

1. **By Block CID**  
   Looks for a specific block in the `car_blocks` table using the CID as a key.

2. **By File CID**  
   Looks for all car blocks associated with a file whose CID matches the given CID.

---

#### 🗺️ Query: `byBlockCid`

Retrieves block-level metadata by matching a **block CID** in the `car_blocks` table. This is typically used to locate individual blocks within a CAR file.

**✅ Joins:**
- `files`: for the file path and size.
- `cars`: to connect to the CAR that holds the block.
- `storages`: for storage configuration and path prefix.
- `source_attachments`: as a fallback to find the correct storage when `cars.storage_id` is not set (observed in some Singularity datasets).

**⚙️ Behavior:**
- Prefers `cars.storage_id` if set.
- Falls back to `source_attachments.storage_id` when `cars.storage_id` is `NULL`.

**💾 SQL:**

```sql
SELECT 
  cb.cid,
  cb.varint,
  cb.raw_block,
  cb.file_offset,
  cb.car_offset,
  cb.car_block_length,
  f.path AS file_path,
  f.size AS file_size,
  s.name AS storage_name,
  s.type AS storage_type,
  s.path AS storage_path,
  s.config AS storage_config
FROM car_blocks cb
LEFT JOIN files f ON cb.file_id = f.id
LEFT JOIN cars c ON cb.car_id = c.id
LEFT JOIN source_attachments sa ON c.attachment_id = sa.id
LEFT JOIN storages s ON c.storage_id = s.id OR sa.storage_id = s.id
WHERE cb.cid = ?
```

#### 🗺️ Query: `byFileCid`

Retrieves all car blocks associated with a given **file CID** from the `files` table. Useful when the input CID represents a full file rather than a block.

**✅ Joins:**
- `car_blocks`: to get all blocks that compose the file.
- `cars`: for the CAR file that contains the blocks.
- `storages`: for storage metadata and access URLs.
- `source_attachments`: fallback for storage lookup when `cars.storage_id` is missing.

**⚙️ Behavior:**
- Same fallback logic as `byBlockCid` regarding `storage_id`.

**💾 SQL:**

```sql
SELECT 
  cb.cid,
  cb.varint,
  cb.raw_block,
  cb.file_offset,
  cb.car_offset,
  cb.car_block_length,
  f.path AS file_path,
  f.size AS file_size,
  s.name AS storage_name,
  s.type AS storage_type,
  s.path AS storage_path,
  s.config AS storage_config
FROM files f
JOIN car_blocks cb ON f.id = cb.file_id
JOIN cars c ON cb.car_id = c.id
LEFT JOIN source_attachments sa ON c.attachment_id = sa.id
LEFT JOIN storages s ON c.storage_id = s.id OR sa.storage_id = s.id
WHERE f.cid = ?
```

#### Notes

- The queries use a dual-path lookup for storage:
  - **Primary:** via `cars.storage_id`.
  - **Fallback:** via `source_attachments.storage_id`.
- This design is intentional to handle cases where Singularity does not persist `cars.storage_id` correctly, which has been observed in production databases.

### `varint` and `car_block_length` in the indexes

In CAR (Content Addressable aRchive) files, each block is encoded with:
1. A varint-prefixed length.
2. A CID (Content Identifier).
3. The raw block bytes.

```sh
|-- varint --|-- CID --|-- raw block --|
        ↳ tells how big CID + block is
Total block size = varint length + varint value
```

#### 🔢 How Sizes Are Calculated

**Varint**

- The varint encodes:

```sh
length_of(CID_bytes + raw_block_bytes)
```

- This varint tells how many bytes follow (CID + block), but does **not** include itself.

**Car Block Length (car_block_length)**

- The total length of the block in the CAR file including the varint itself.

```sh
car_block_length = varint_bytes_length + varint_value
```

## Future optimizations

The IndexStore relies on `multihashes`, while Singularity's Database relies on CIDs that may have `raw` or `dag-pb` multicodecs. Therefore, the first characters of the CID in the table will be `bafyb` or `bafkr`. Either queries need to take this into account, or multiple queries may be needed. There are multiple options, such as:

1. **Table updated with new column** to have only the necessary suffix in place, and an index for this column is created. This column should either have a suffix of the CID, a RAW encoded CID or its content should be in binary to enable creating indexes for suffixes.
2. **IndexStore needs to try out first one option** (for example `raw` encoded multihash) and fallback to try the other multicodec afterwards
3. **IndexStore queries with `substr`** to avoid the second query, but the loss of index efficiency is arguably worse than trying the most common multicodecs first

For the first implementation, this IndexStore implementation will rely on the second option. This MAY be revisited later.
