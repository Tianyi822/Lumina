import { execFileSync } from 'child_process'
import * as iconv from 'iconv-lite'

let windowsConsoleEncoding: string | null = null

/**
 * 获取 Windows 控制台的当前代码页编码
 * 通过执行 chcp.com 获取，结果会缓存避免重复执行
 * @returns 编码名称（如 'utf8'、'gb18030' 等）
 */
function getWindowsConsoleEncoding(): string {
  if (windowsConsoleEncoding) {
    return windowsConsoleEncoding
  }

  try {
    const output = execFileSync('chcp.com', {
      encoding: 'buffer',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const codePage = iconv.decode(output, 'gb18030').match(/\d+/)?.[0]
    const encoding = codePage === '65001' ? 'utf8' : `cp${codePage || '936'}`
    windowsConsoleEncoding = iconv.encodingExists(encoding) ? encoding : 'gb18030'
  } catch {
    windowsConsoleEncoding = 'gb18030'
  }

  return windowsConsoleEncoding
}

/**
 * 向 Windows 控制台写入消息（含编码转换）
 * 将 UTF-8 消息转换为 Windows 控制台当前代码页编码
 * @param stream 输出流（stdout/stderr）
 * @param message 消息内容
 */
export function writeWindowsConsole(stream: NodeJS.WriteStream, message: string): void {
  const encoding = getWindowsConsoleEncoding()
  if (encoding === 'utf8' || !stream.isTTY) {
    stream.write(`${message}\n`)
    return
  }

  stream.write(iconv.encode(`${message}\n`, encoding))
}
