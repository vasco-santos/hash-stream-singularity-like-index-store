BEGIN TRANSACTION;
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
CREATE TABLE IF NOT EXISTS "deals" (
	"id"	integer,
	"created_at"	datetime,
	"updated_at"	datetime,
	"last_verified_at"	datetime,
	"deal_id"	integer UNIQUE,
	"state"	text,
	"provider"	text,
	"proposal_id"	text,
	"label"	text,
	"piece_cid"	blob,
	"piece_size"	integer,
	"start_epoch"	integer,
	"end_epoch"	integer,
	"sector_start_epoch"	integer,
	"price"	text,
	"verified"	numeric,
	"error_message"	text,
	"schedule_id"	integer,
	"client_id"	text,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_deals_wallet" FOREIGN KEY("client_id") REFERENCES "wallets"("id") ON DELETE SET NULL,
	CONSTRAINT "fk_deals_schedule" FOREIGN KEY("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "directories" (
	"id"	integer,
	"cid"	blob,
	"data"	blob,
	"name"	text,
	"exported"	numeric,
	"attachment_id"	integer,
	"parent_id"	integer,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_directories_attachment" FOREIGN KEY("attachment_id") REFERENCES "source_attachments"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_directories_parent" FOREIGN KEY("parent_id") REFERENCES "directories"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "file_ranges" (
	"id"	integer,
	"offset"	integer,
	"length"	integer,
	"cid"	blob,
	"job_id"	integer,
	"file_id"	integer,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_files_file_ranges" FOREIGN KEY("file_id") REFERENCES "files"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_jobs_file_ranges" FOREIGN KEY("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL
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
CREATE TABLE IF NOT EXISTS "globals" (
	"key"	text,
	"value"	text,
	PRIMARY KEY("key")
);
CREATE TABLE IF NOT EXISTS "jobs" (
	"id"	integer,
	"type"	text,
	"state"	text,
	"error_message"	text,
	"error_stack_trace"	text,
	"worker_id"	text,
	"attachment_id"	integer,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_jobs_attachment" FOREIGN KEY("attachment_id") REFERENCES "source_attachments"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_jobs_worker" FOREIGN KEY("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "output_attachments" (
	"id"	integer,
	"preparation_id"	integer,
	"storage_id"	integer,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_output_attachments_preparation" FOREIGN KEY("preparation_id") REFERENCES "preparations"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_output_attachments_storage" FOREIGN KEY("storage_id") REFERENCES "storages"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "preparations" (
	"id"	integer,
	"name"	text UNIQUE,
	"created_at"	datetime,
	"updated_at"	datetime,
	"delete_after_export"	numeric,
	"max_size"	integer,
	"piece_size"	integer,
	"min_piece_size"	integer,
	"no_inline"	numeric,
	"no_dag"	numeric,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "schedules" (
	"id"	integer,
	"created_at"	datetime,
	"updated_at"	datetime,
	"url_template"	text,
	"http_headers"	JSON,
	"provider"	text,
	"price_per_gb_epoch"	real,
	"price_per_gb"	real,
	"price_per_deal"	real,
	"total_deal_number"	integer,
	"total_deal_size"	integer,
	"verified"	numeric,
	"keep_unsealed"	numeric,
	"announce_to_ipni"	numeric,
	"start_delay"	integer,
	"duration"	integer,
	"state"	text,
	"schedule_cron"	text,
	"schedule_cron_perpetual"	numeric,
	"schedule_deal_number"	integer,
	"schedule_deal_size"	integer,
	"max_pending_deal_number"	integer,
	"max_pending_deal_size"	integer,
	"notes"	text,
	"error_message"	text,
	"allowed_piece_cids"	JSON,
	"force"	numeric,
	"preparation_id"	integer,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_schedules_preparation" FOREIGN KEY("preparation_id") REFERENCES "preparations"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "source_attachments" (
	"id"	integer,
	"preparation_id"	integer,
	"storage_id"	integer,
	PRIMARY KEY("id"),
	CONSTRAINT "fk_source_attachments_preparation" FOREIGN KEY("preparation_id") REFERENCES "preparations"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_source_attachments_storage" FOREIGN KEY("storage_id") REFERENCES "storages"("id") ON DELETE CASCADE
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
CREATE TABLE IF NOT EXISTS "wallet_assignments" (
	"preparation_id"	integer,
	"wallet_id"	text,
	PRIMARY KEY("preparation_id","wallet_id"),
	CONSTRAINT "fk_wallet_assignments_preparation" FOREIGN KEY("preparation_id") REFERENCES "preparations"("id"),
	CONSTRAINT "fk_wallet_assignments_wallet" FOREIGN KEY("wallet_id") REFERENCES "wallets"("id")
);
CREATE TABLE IF NOT EXISTS "wallets" (
	"id"	text,
	"address"	text,
	"private_key"	text,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "workers" (
	"id"	text,
	"last_heartbeat"	datetime,
	"hostname"	text,
	"type"	text,
	PRIMARY KEY("id")
);
CREATE INDEX IF NOT EXISTS "directory_source_parent" ON "directories" (
	"attachment_id",
	"parent_id"
);
CREATE INDEX IF NOT EXISTS "idx_car_blocks_c_id" ON "car_blocks" (
	"cid"
);
CREATE INDEX IF NOT EXISTS "idx_car_blocks_car_id" ON "car_blocks" (
	"car_id"
);
CREATE INDEX IF NOT EXISTS "idx_cars_piece_c_id" ON "cars" (
	"piece_cid"
);
CREATE INDEX IF NOT EXISTS "idx_deals_piece_c_id" ON "deals" (
	"piece_cid"
);
CREATE INDEX IF NOT EXISTS "idx_file_ranges_file_id" ON "file_ranges" (
	"file_id"
);
CREATE INDEX IF NOT EXISTS "idx_file_ranges_job_id" ON "file_ranges" (
	"job_id"
);
CREATE INDEX IF NOT EXISTS "idx_files_directory_id" ON "files" (
	"directory_id"
);
CREATE INDEX IF NOT EXISTS "idx_files_path" ON "files" (
	"path"
);
CREATE INDEX IF NOT EXISTS "idx_pending" ON "deals" (
	"state",
	"client_id"
);
CREATE INDEX IF NOT EXISTS "idx_wallets_address" ON "wallets" (
	"address"
);
CREATE INDEX IF NOT EXISTS "job_type_state" ON "jobs" (
	"type",
	"state"
);
CREATE UNIQUE INDEX IF NOT EXISTS "prep_output" ON "output_attachments" (
	"preparation_id",
	"storage_id"
);
CREATE UNIQUE INDEX IF NOT EXISTS "prep_source" ON "source_attachments" (
	"preparation_id",
	"storage_id"
);
COMMIT;
