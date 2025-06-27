/* global Buffer process console */

import fs from 'fs'
import { resolve, isAbsolute } from 'path'

import { CID } from 'multiformats/cid'

// ========= Parse Arguments =========
const args = process.argv.slice(2)

const jsonArg = args.find((arg) => arg.startsWith('--json-path='))
const outputArg = args.find((arg) => arg.startsWith('--output-path='))

if (!jsonArg) {
  console.error(
    'Usage: node script.js --json-path=./example/data.json --output-path=./output.json'
  )
  process.exit(1)
}

const pieceJsonPath = toAbsolutePath(jsonArg.split('=')[1])
const outputPath = outputArg
  ? toAbsolutePath(outputArg.split('=')[1])
  : resolve(process.cwd(), 'output.json')

console.log(`JSON input: ${pieceJsonPath}`)
console.log(`JSON output: ${outputPath}`)

// ========= Run =========
const json = JSON.parse(fs.readFileSync(pieceJsonPath, 'utf-8'))
const output = collectFileAndBlockCids(json)
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
console.log('Output written to', outputPath)

// ========= Helpers =========

function toAbsolutePath(p) {
  return isAbsolute(p) ? p : resolve(process.cwd(), p)
}

/**
 * Collects all file CIDs and related block CIDs.
 *
 * A block is considered related if:
 * - The block.cid matches the file.cid, or
 * - The block.file_id matches the file.id
 *
 * @param {any} data - The JSON object loaded (contains files and carBlocks arrays)
 * @returns {Array<{ fileCid: string, blocks: string[] }>}
 */
export function collectFileAndBlockCids(data) {
  const { files, carBlocks } = data
  const result = []

  for (const file of files) {
    const fileCid = CID.parse(file.cid).toString()

    const relatedBlocks = carBlocks.filter(
      (block) => block.fileId === file.id || block.cid === file.cid
    )

    const blockCids = relatedBlocks.map((block) =>
      CID.parse(block.cid).toString()
    )

    result.push({
      fileCid,
      blocks: blockCids,
    })
  }

  return result
}
