BEGIN TRANSACTION;

-- Initial insertions provided earlier:

-- 1. storages
INSERT INTO storages (
  id, name, created_at, updated_at, type, path, config, client_config
) VALUES (
  400,
  'collection-name',
  '2024-12-13T17:37:44.703659Z',
  '2024-12-13T17:37:44.703659Z',
  'example.com',
  'collection-name',
  '{"disable_checksum":"true","encoding":"Slash,LtGt,CrLf,Del,Ctl,InvalidUtf8,Dot","endpoint":"https://s3.us.example.com","front_endpoint":"https://example.com","wait_archive":"0s"}',
  '{}'
);

-- 2. preparations
INSERT INTO preparations (
  id, name, created_at, updated_at, delete_after_export, max_size, piece_size, min_piece_size, no_inline, no_dag
) VALUES (
  400,
  'example-preparation',
  '2024-12-13T17:30:00Z',
  '2024-12-13T17:30:00Z',
  0, NULL, NULL, NULL, 0, 0
);

-- 3. source_attachments
INSERT INTO source_attachments (
  id, preparation_id, storage_id
) VALUES (
  396,
  400,
  400
);

-- 4. jobs
INSERT INTO jobs (
  id, type, state, error_message, error_stack_trace, worker_id, attachment_id
) VALUES (
  3688,
  'example-job',
  'done',
  NULL,
  NULL,
  NULL,
  396
);

-- 5. cars
INSERT INTO cars (
  id, created_at, piece_type, piece_cid, piece_size, root_cid, file_size, storage_id,
  storage_path, num_of_files, preparation_id, attachment_id, job_id
) VALUES (
  3238,
  '2024-12-13T17:42:23.929936Z',
  '',
  X'017112202F55E3B8F9D8B87F388AD76033F5128E65A1A334B9B3E1DAA0154C4DD25394CDBFD48ED1',
  34359738368,
  X'01711220C43D3C6A65291E416BD5455B23FC36AB2FD9893C722AAD37F0A7FA865F05AA2F78',
  10595821705,
  NULL,
  '',
  76,
  400,
  396,
  3688
);

-- 6. directories (required by files)
INSERT INTO directories (id, cid, name, exported, attachment_id, parent_id)
VALUES (
  1,
  X'01711220C43D3C6A65291E416BD5455B23FC36AB2FD9893C722AAD37F0A7FA865F05AA2F78',
  'root',
  0,
  396,
  NULL
);

-- 7. Add cars for car_blocks.car_id = 17482
-- Placeholder data, linking to existing preparation 400 and attachment 396.
INSERT INTO cars (
  id, created_at, piece_type, piece_cid, piece_size, root_cid, file_size, storage_id,
  storage_path, num_of_files, preparation_id, attachment_id, job_id
) VALUES (
  17482,
  '2024-12-13T17:42:23.929936Z', -- Use a dummy date
  '',
  X'01711220AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', -- Placeholder CID, please replace if you have the actual CID for this car piece.
  1, -- Placeholder size
  X'01711220BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', -- Placeholder CID, please replace if you have the actual root CID for this car.
  1, -- Placeholder size
  NULL,
  '',
  0,
  400, -- Link to existing preparation
  396, -- Link to existing attachment
  NULL -- No specific job provided for this car in the JSON context, or it's implicitly handled.
);

-- New insertions from the JSON (files first, then car_blocks):

-- 8. files
INSERT INTO files (id, cid, path, hash, size, last_modified_nano, attachment_id, directory_id)
VALUES (
  2085318,
  X'0170122077baa8076b2061bb11fdf87c2278a580803177fed1eb92c80e019beb9493fc05',
  'filename.mp3',
  '03f41c1eb44caa4f8e55768e6b2fc127',
  2154675,
  1746799656000000000,
  396,
  1
);

-- 9. car_blocks
INSERT INTO car_blocks (id, cid, car_offset, car_block_length, varint, raw_block, file_offset, car_id, file_id)
VALUES (
  377351953,
  X'01551220f77d71ec7c0b73bb2e11b3b05aa38219164d6ca7a9fb4e25bd97a73c16c77864',
  59,
  1048615,
  X'A48040',
  NULL,
  0,
  17482,
  2085318
);

INSERT INTO car_blocks (id, cid, car_offset, car_block_length, varint, raw_block, file_offset, car_id, file_id)
VALUES (
  377351954,
  X'015512209278a955403a93e0fbfdab7a90920ac37763b7b605793b55b5ec64bd337781cf',
  1048674,
  1048615,
  X'A48040',
  NULL,
  1048576,
  17482,
  2085318
);

INSERT INTO car_blocks (id, cid, car_offset, car_block_length, varint, raw_block, file_offset, car_id, file_id)
VALUES (
  377351955,
  X'0155122062c5ffb399fba33a589284b70ba6215eae72abfe1b4a36677650d420a02757a4',
  2097289,
  57562,
  X'D7C103',
  NULL,
  2097152,
  17482,
  2085318
);

COMMIT;

-- INSERT INTO car_blocks (id, cid, car_offset, car_block_length, varint, raw_block, file_offset, car_id, file_id)
-- VALUES (
--   377351956,
--   X'017112204683058D9C2E3516B0933C6B9AA95400D0B5136B316986F9A27D72B706E5D3E3',
--   2154851,
--   197,
--   X'C301',
--   X'44320A240901551220F77D71EC7CBCCBB7B846B3B231B3B05AB38219164D64B5A7A9FB3885C77864190188802012C0A2409015512209278A955403AE9F0FBDB7ADAC4920AC37763B7B605793B5B75B124B5D37781CF120188802012C0A24090155122062C5FFB39FBB263A589284B70BB9855EB272AAF9BB1B4A2666F650D420A09D7A49018318CB040A10218B3C1830601202018B3C183',
--   0,
--   17482,
--   NULL
-- );

-- {
--   "car": {
--     "id": 3238,
--     "createdAt": "2024-12-13T17:42:23.929936Z",
--     "pieceType": "",
--     "pieceCid": "baga6ea4seaqht4hpq3xrhlkvtd5hwccvp2qb6zj7v3ro4p7pfl3hqogiprjeoli",
--     "pieceSize": 34359738368,
--     "rootCid": "bafkreiheq4nxa6zhldxzok5y5f22ci7mydxxdcoya6snzxoim6z3ubigwi",
--     "fileSize": 10595821705,
--     "storageId": 400,
--     "storagePath": "",
--     "numOfFiles": 76,
--     "preparationId": 400,
--     "attachmentId": 396,
--     "jobId": 3688
--   },
--   "storage": {
--     "id": 400,
--     "name": "collection-name",
--     "createdAt": "2024-12-13T17:37:44.703659Z",
--     "updatedAt": "2024-12-13T17:37:44.703659Z",
--     "type": "example.com",
--     "path": "collection-name",
--     "config": {
--       "disable_checksum": "true",
--       "encoding": "Slash,LtGt,CrLf,Del,Ctl,InvalidUtf8,Dot",
--       "endpoint": "https://s3.us.example.com",
--       "front_endpoint": "https://example.com",
--       "wait_archive": "0s"
--     },
--     "clientConfig": {}
--   },
--   "carBlocks": [
--     {
--       "id": 377351953,
--       "cid": "bafkreihxpvy6y7aloo5s4entwbnkhaqzczgwzj5j7nhclpmxu46bnr3ymq",
--       "carOffset": 59,
--       "carBlockLength": 1048615,
--       "varint": "pIBA",
--       "rawBlock": null,
--       "fileOffset": 0,
--       "carId": 17482,
--       "fileId": 2085318
--     },
--     {
--       "id": 377351954,
--       "cid": "bafkreiespcuvkqb2spqpx7nlpkijecwdo5r3pnqfpe5vlnpmms6tg54bz4",
--       "carOffset": 1048674,
--       "carBlockLength": 1048615,
--       "varint": "pIBA",
--       "rawBlock": null,
--       "fileOffset": 1048576,
--       "carId": 17482,
--       "fileId": 2085318
--     },
--     {
--       "id": 377351955,
--       "cid": "bafkreidcyx73hgp3um5freuew4f2mik6vzzkx7q3ji3go5sq2qqkaj2xuq",
--       "carOffset": 2097289,
--       "carBlockLength": 57562,
--       "varint": "18ED",
--       "rawBlock": null,
--       "fileOffset": 2097152,
--       "carId": 17482,
--       "fileId": 2085318
--     },
--     {
--       "id": 377351956,
--       "cid": "bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au",
--       "carOffset": 2154851,
--       "carBlockLength": 197,
--       "varint": "wwE=",
--       "rawBlock": "EiwKJAFVEiD3fXHsfAtzuy4Rs7Bao4IZFk1sp6n7TiW9l6c8Fsd4ZBIAGICAQBIsCiQBVRIgknipVUA6k+D7/at6kJIKw3djt7YFeTtVtexkvTN3gc8SABiAgEASLAokAVUSIGLF/7OZ+6M6WJKEtwumIV6ucqv+G0o2Z3ZQ1CCgJ1ekEgAYs8EDChMIAhizwYMBIICAQCCAgEAgs8ED",
--       "fileOffset": 0,
--       "carId": 17482,
--       "fileId": null
--     }
--   ],
--   "files": [
--     {
--       "id": 2085318,
--       "cid": "bafybeidxxkuao2zamg5rd7pypqrhrjmaqayxp7wr5ojmqdqbtpvzje74au",
--       "path": "filename.mp3",
--       "hash": "03f41c1eb44caa4f8e55768e6b2fc127",
--       "size": 2154675,
--       "lastModifiedNano": 1746799656000000000,
--       "attachmentId": 590,
--       "directoryId": 18042
--     }
--   ]
-- }
