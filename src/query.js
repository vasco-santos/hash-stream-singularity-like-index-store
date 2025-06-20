/**
 * SQL queries used to retrieve index records for a given CID
 * from a Singularity-like SQLite database.
 *
 * These queries target two different "entry points":
 * - via the `car_blocks` table (direct match on block-level CID)
 * - via the `files` table (match on file-level CID)
 */

/**
 * Query a block's metadata from the `car_blocks` table by its CID.
 * Follows joins through files, cars, and storages.
 * Uses both `cars.storage_id` and fallback via `source_attachments.storage_id`.
 * Note that `c.storage_id` is used first, and if not found, `sa.storage_id` is used, given it
 * was noticed that sometimes Singularity does not have updated `c.storage_id`.
 *
 * Joins with:
 * - `files` to retrieve file path and size
 * - `cars` to access storage metadata
 * - `storages` for storage config and path prefix
 *
 * @type {string}
 */
export const byBlockCid = `
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
`

/**
 * Query all car blocks associated with a file CID.
 * This is a secondary entry point when the input CID matches a file.
 * Joins through car_blocks, cars, and storages — including fallback via `source_attachments`.
 * Note that `c.storage_id` is used first, and if not found, `sa.storage_id` is used, given it
 * was noticed that sometimes Singularity does not have updated `c.storage_id`.
 *
 * Joins with:
 * - `car_blocks` to find all blocks that reference the file
 * - `cars` for car-level data
 * - `storages` for storage metadata
 *
 * @type {string}
 */
export const byFileCid = `
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
`
