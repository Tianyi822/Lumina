/**
 * 无 padding 的规范 base64url 编解码（RFC 4648 URL-safe，去掉 `=`）。
 *
 * 与服务端 Go `base64.RawURLEncoding` 完全一致：Node 的 `'base64url'` 编码
 * 天然无 padding。解码时也执行规范形回校，避免 Node Buffer 对 padding、
 * 非 URL-safe 字符和尾随垃圾的宽容解析污染本地身份或协议响应。
 */

/** 字节数组 → base64url 字符串（无 padding） */
export function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

/** base64url 字符串 → 字节数组 */
export function decodeBase64Url(value: string, expectedBytes?: number): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error('base64url 字段格式非法')
  }
  const decoded = new Uint8Array(Buffer.from(value, 'base64url'))
  if (encodeBase64Url(decoded) !== value) {
    throw new Error('base64url 字段不是规范编码')
  }
  if (expectedBytes !== undefined && decoded.length !== expectedBytes) {
    throw new Error(`base64url 字段长度非法：期望 ${expectedBytes} 字节，实际 ${decoded.length}`)
  }
  return decoded
}

/** UTF-8 字符串 → 字节数组 */
export function utf8ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'utf-8'))
}
