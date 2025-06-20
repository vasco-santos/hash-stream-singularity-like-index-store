/* global Buffer */
import { varint } from 'multiformats'

/**
 * Reads all chunks from a ReadableStream and returns them as an array.
 *
 * @template T
 * @param {ReadableStream<T>} stream
 * @returns {Promise<T[]>}
 */
export async function readAll(stream) {
  const reader = stream.getReader()
  const chunks = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks
}

/**
 * Reads all chunks from a ReadableStream and returns the last.
 *
 * @template T
 * @param {ReadableStream<T>} stream
 * @returns {Promise<T | undefined>}
 */
export async function readLast(stream) {
  const reader = stream.getReader()
  let chunk
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    chunk = value
  }
  return chunk
}

/**
 * @param {string} base64
 */
export function decodeVarint(base64) {
  const buf = Buffer.from(base64, 'base64')
  const decodedVarint = varint.decode(buf)

  return {
    payloadLength: decodedVarint[0],
    varintBytes: decodedVarint[1],
    carBlockLength: decodedVarint[0] + decodedVarint[1],
  }
}

/**
 * @param {number} payloadLength
 */
export function encodeVarint(payloadLength) {
  const varintBytes = varint.encodingLength(payloadLength)
  const u = new Uint8Array(varintBytes)
  varint.encodeTo(payloadLength, u, 0)
  return u
}

/**
 *
 * @param {Uint8Array[]} chunks
 */
export function getBytesFromChunckedBytes(chunks) {
  const totalSize = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const writtenCarBytes = new Uint8Array(totalSize)
  let offset = 0
  for (const chunk of chunks) {
    writtenCarBytes.set(chunk, offset)
    offset += chunk.length
  }
  return writtenCarBytes
}
