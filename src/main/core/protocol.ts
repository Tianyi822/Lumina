import { net, protocol } from 'electron'
import { pathToFileURL } from 'url'
import { logger } from '@main/services/logger'
import { getPapersDirPath } from '@main/services/paper/paperPaths'
import { getWritingRootPath } from '@main/services/writer/writerPaths'
import { resolveLuminaResourceFile } from './luminaProtocolResolver'

const PROTOCOL_SCHEME = 'lumina'

// 注册自定义协议为特权方案（必须在 app ready 之前调用）
protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
])

/**
 * 注册 lumina:// 自定义协议
 * URL 格式: lumina://paper/{paperId}/pages/{filename}
 *           lumina://paper/{paperId}/assets/{path}
 *           lumina://writing/{documentId}/assets/{filename}
 * 将 URL 路径映射到本地安全资源，直接返回文件（避免 Base64 IPC 传输）
 */
export function registerLuminaProtocol(): void {
  protocol.handle(PROTOCOL_SCHEME, async (request) => {
    const resolution = await resolveLuminaResourceFile(request.url, {
      papersRoot: getPapersDirPath(),
      writingRoot: getWritingRootPath()
    })
    if (!resolution.success) {
      logger.warn('lumina 协议请求被拒绝', 'main', {
        url: request.url,
        reason: resolution.reason
      })
      return new Response(null, { status: 403 })
    }
    try {
      const response = await net.fetch(pathToFileURL(resolution.path).toString())
      if (!response.ok) {
        return new Response(null, { status: response.status })
      }
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': resolution.mimeType,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': resolution.cacheControl
        }
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('lumina 协议请求处理失败', 'main', {
        url: request.url,
        error: errorMessage
      })
      return new Response(null, { status: 500 })
    }
  })
}
