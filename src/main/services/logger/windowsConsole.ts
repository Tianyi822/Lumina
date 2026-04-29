import { execFileSync } from 'child_process'
import * as iconv from 'iconv-lite'

let windowsConsoleEncoding: string | null = null

function getWindowsConsoleEncoding(): string {
  if (windowsConsoleEncoding) {
    return windowsConsoleEncoding
  }

  try {
    const output = execFileSync('chcp.com', { encoding: 'utf8', windowsHide: true })
    const codePage = output.match(/\d+/)?.[0]
    const encoding = codePage === '65001' ? 'utf8' : `cp${codePage || '936'}`
    windowsConsoleEncoding = iconv.encodingExists(encoding) ? encoding : 'gb18030'
  } catch {
    windowsConsoleEncoding = 'gb18030'
  }

  return windowsConsoleEncoding
}

export function writeWindowsConsole(stream: NodeJS.WriteStream, message: string): void {
  const encoding = getWindowsConsoleEncoding()
  if (encoding === 'utf8') {
    stream.write(`${message}\n`)
    return
  }

  stream.write(iconv.encode(`${message}\n`, encoding))
}
