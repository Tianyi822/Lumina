import { BrowserWindow } from 'electron'
import { logger } from '@main/services/logger'
import { WriterAssetService } from './WriterAssetService'
import { sendWriterFlushRequestToWindow, WriterFlushCoordinator } from './WriterFlushCoordinator'
import { WriterService } from './WriterService'
import { WriterStorageService } from './WriterStorageService'

const WRITER_RENDERER_FLUSH_TIMEOUT_MS = 1_500

const writerFlushCoordinator = new WriterFlushCoordinator({
  send: (webContentsId, channel) =>
    sendWriterFlushRequestToWindow(BrowserWindow.getAllWindows(), webContentsId, channel),
  timeoutMs: WRITER_RENDERER_FLUSH_TIMEOUT_MS,
  warn: (webContentsId, reason) => {
    logger.warn('Renderer 写作文档退出刷新未确认，继续退出', 'main', {
      webContentsId,
      reason,
      timeoutMs: WRITER_RENDERER_FLUSH_TIMEOUT_MS
    })
  }
})

/**
 * 底层存储/资源服务单例：与 writerService 共享同一实例。
 * writing 同步引擎直接复用此实例的写队列（applySynced* / readDocumentForSync / importBytes），
 * 与 sessionService.getStorage() 共享 SessionStorageService 同理。
 */
export const writerStorageService = new WriterStorageService()
export const writerAssetService = new WriterAssetService()

export const writerService = new WriterService({
  storageService: writerStorageService,
  assetService: writerAssetService,
  flushCoordinator: writerFlushCoordinator,
  getWebContentsIds: () =>
    BrowserWindow.getAllWindows()
      .filter((window) => !window.isDestroyed() && !window.webContents.isDestroyed())
      .map((window) => window.webContents.id)
})

export async function initializeWriterService(): Promise<void> {
  const result = await writerService.initialize()
  if (!result.success) {
    logger.error('初始化写作服务失败，写作功能可能不可用', 'main', {
      error: result.error,
      code: result.code
    })
  }
}

export { WriterService } from './WriterService'
export type { WriterAssetPort, WriterExportDialogPort, WriterStoragePort } from './WriterService'
export { WriterStorageService } from './WriterStorageService'
export { WriterAssetService } from './WriterAssetService'
export { WriterFlushCoordinator } from './WriterFlushCoordinator'
export { WriterDocumentMapper } from './WriterDocumentMapper'
export { WriterMarkdownExporter, sanitizeExportBaseName } from './WriterMarkdownExporter'
export { WriterDocxExporter } from './WriterDocxExporter'
export { WriterFormulaRasterizer } from './WriterFormulaRasterizer'
export { WriterPrintHtmlRenderer } from './WriterPrintHtmlRenderer'
export { WriterPrintExporter } from './WriterPrintExporter'
export {
  getWriterAssetsDir,
  getWriterDocumentDir,
  getWriterDocumentPath,
  getWriterDocumentsPath,
  getWriterIndexPath,
  getWritingRootPath,
  isValidWriterDocumentId
} from './writerPaths'
