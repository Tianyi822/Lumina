/**
 * 共享的文件切块工具（paper pack / knowledge file 复用）。
 *
 * 流式读取文件并按 CHUNK_BYTES 切块，逐块回调明文（供 AEAD 加密上传到 relay
 * blocks 通道）。切块尺寸预留 AEAD 开销，保证密文 ≤ relay maxBlockBytes=1MiB。
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'

/** 明文块上限：1MiB - 64B（预留 AEAD nonce24+tag16 开销，保证密文 ≤ relay maxBlockBytes=1MiB） */
export const CHUNK_BYTES = 1024 * 1024 - 64

/** 单文件大小硬上限（对齐 paper/knowledge 的文件体积约束） */
const MAX_FILE_BYTES = 200 * 1024 * 1024

/**
 * 流式读取文件并按 CHUNK_BYTES 切块，逐块回调明文（供加密上传）。
 * 返回总块数、文件 sha256 与大小；超过 MAX_FILE_BYTES 抛异常。
 */
export async function chunkFile(
  filePath: string,
  onChunk: (chunk: Uint8Array, index: number) => Promise<void>
): Promise<{ chunks: number; sha256: string; size: number }> {
  const st = await stat(filePath)
  if (st.size > MAX_FILE_BYTES) {
    throw new Error(`文件超过 ${MAX_FILE_BYTES} 字节上限：${filePath}`)
  }
  const hash = createHash('sha256')
  let chunks = 0
  let buffer: Buffer = Buffer.alloc(0)
  for await (const data of createReadStream(filePath)) {
    buffer = Buffer.concat([buffer, data as Buffer])
    while (buffer.length >= CHUNK_BYTES) {
      const chunk = buffer.subarray(0, CHUNK_BYTES)
      buffer = buffer.subarray(CHUNK_BYTES)
      hash.update(chunk)
      await onChunk(new Uint8Array(chunk), chunks)
      chunks++
    }
  }
  if (buffer.length > 0) {
    hash.update(buffer)
    await onChunk(new Uint8Array(buffer), chunks)
    chunks++
  }
  return { chunks, sha256: hash.digest('hex'), size: st.size }
}
