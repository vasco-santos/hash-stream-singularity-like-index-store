# HashStream server backed by singularity like store

## Getting Started

TODO: Specify how we run server

### Install dependencies

```sh
pnpm install
```

### Run server in one terminal

## Test with Fixture data

In this section we test the running HashStream server with a real prepared Database.

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

```sh
wget http://localhost:3000/ipfs/bafkreigzcnxjfwnu2gonjdak3u53u3lpfknufzf5eor7vt4kdkpu6afhhi?format=car

ipfs-car unpack bafkreigzcnxjfwnu2gonjdak3u53u3lpfknufzf5eor7vt4kdkpu6afhhi.car --output 200411_Mode_Art_Can_1482_R3_master.intros_000009.jpg --verify

open 200411_Mode_Art_Can_1482_R3_master.intros_000009.jpg
```

### Download DagPB content as CAR

```sh
wget http://localhost:3000/ipfs/bafybeiduqr2463vs62imbqmnrimhva5p4ljg6cp3u72fm3jikgkffbofqi?format=car

ipfs-car unpack bafybeiduqr2463vs62imbqmnrimhva5p4ljg6cp3u72fm3jikgkffbofqi.car --output 200411_Mode_Art_Can_1482_R3_master.intros.mp4 --verify

open 200411_Mode_Art_Can_1482_R3_master.intros.mp4
```

Behind the scenes it fetches:

```json
{
  "carBlocks": [
    {
      "id": 257228941,
      "cid": "bafkreidnw5wyvpyfmvqzbweha53pje24vljagv6ib5xkyboxlno5ddqtfa",
      "carOffset": 1786976220,
      "carBlockLength": 1048615,
      "varint": "pIBA",
      "rawBlock": null,
      "fileOffset": 0,
      "carId": 13653,
      "fileId": 1474466
    },
    {
      "id": 257228942,
      "cid": "bafkreiaernta5yu6anf4xdqotfttiky5yyz7nxpi6qmqimmhefovejzf74",
      "carOffset": 1788024835,
      "carBlockLength": 1048615,
      "varint": "pIBA",
      "rawBlock": null,
      "fileOffset": 1048576,
      "carId": 13653,
      "fileId": 1474466
    },
    {
      "id": 257228943,
      "cid": "bafkreibojm2nkvcefyvkrwmxcrqpjrdrab3temihsl2jlu2ddcujbop42a",
      "carOffset": 1789073450,
      "carBlockLength": 1048615,
      "varint": "pIBA",
      "rawBlock": null,
      "fileOffset": 2097152,
      "carId": 13653,
      "fileId": 1474466
    },
    {
      "id": 257228944,
      "cid": "bafkreihwx27ebxhujq4d72jm36ezrbtepxixdfkajpvpcel5wtcohba4ti",
      "carOffset": 1790122065,
      "carBlockLength": 194856,
      "varint": "pfIL",
      "rawBlock": null,
      "fileOffset": 3145728,
      "carId": 13653,
      "fileId": 1474466
    },
    {
      "id": 257228945,
      "cid": "bafybeiduqr2463vs62imbqmnrimhva5p4ljg6cp3u72fm3jikgkffbofqi",
      "carOffset": 1790316921,
      "carBlockLength": 247,
      "varint": "9QE=",
      "rawBlock": "EiwKJAFVEiBtt22KvwVlYZDYhwd29JNcqtIDV8gPbqwF11td0Y4TKBIAGICAQBIsCiQBVRIgBItmDuKeA0vLjg6ZZzQrHcYz9t3o9BkEMYchXVInJf8SABiAgEASLAokAVUSIC5LNNVURC4qqNmXFGD0xHEAdzIxB5L0ldNDGKiQufzQEgAYgIBAEiwKJAFVEiD2vr5A3PRMOD/pLN+JmIZkfdFxlUBL6vERfbTE44QcmhIAGIHyCwoXCAIYgfLLASCAgEAggIBAIICAQCCB8gs=",
      "fileOffset": 0,
      "carId": 13653,
      "fileId": null
    },

  ],
  "files": [
    {
      "id": 1474466,
      "cid": "bafybeiduqr2463vs62imbqmnrimhva5p4ljg6cp3u72fm3jikgkffbofqi",
      "path": "200411_Mode_Art_Can_1482_R3_master.intros.mp4",
      "hash": "abe3b6fb2eaaebeaed4ccfd17139e142",
      "size": 3340545,
      "lastModifiedNano": 1691558433000000000,
      "attachmentId": 546,
      "directoryId": 9781
    }
  }
}
```

### Download with @helia/verified-fetch
