import { protocol } from 'electron'
import { join, normalize } from 'path'
import { logger } from '@main/services/logger'
import { getPapersDirPath } from '@main/services/paper/paperPaths'

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
 * 将 URL 路径映射到本地论文资源目录，直接返回文件（避免 Base64 IPC 传输）
 */
export function registerLuminaProtocol(): void {
  protocol.registerFileProtocol(PROTOCOL_SCHEME, (request, callback) => {
    try {
      const url = new URL(request.url)
      const relativePath = url.pathname // e.g. /paper/{id}/pages/page-0001.jpg
      const papersDir = getPapersDirPath()
      const resolvedPath = normalize(join(papersDir, relativePath))

      // 安全校验：防止路径穿越攻击
      if (!resolvedPath.startsWith(normalize(papersDir))) {
        logger.warn('lumina 协议请求路径越界', 'main', {
          url: request.url,
          resolved: resolvedPath
        })
        callback({ error: -10 }) // ACCESS_DENIED
        return
      }

      callback({ path: resolvedPath })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('lumina 协议请求处理失败', 'main', {
        url: request.url,
        error: errorMessage
      })
      callback({ error: -2 }) // FAILED
    }
  })
}
