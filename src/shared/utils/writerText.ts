import { createHash } from 'crypto'

/**
 * 规范化写作文本换行（CRLF/CR → LF），保证跨平台哈希稳定
 */
export function normalizeWriterText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * 对写作文本计算稳定 SHA-256（先规范化换行）
 */
export function hashWriterText(text: string): string {
  return createHash('sha256').update(normalizeWriterText(text), 'utf8').digest('hex')
}
