import { ipcMain, dialog, net, BrowserWindow } from 'electron'
import {
  paperStorageService,
  getPaperService,
  paperTranslationService,
  type OcrProgressInfo
} from '@main/services/paper'
import { getFileService } from '@main/services/file'
import { logger } from '@main/services/logger'
import {
  getOcrProviderPreset,
  DEFAULT_OCR_PROVIDER,
  type OcrProviderId
} from '@shared/types/config'
import { fileUrlToPath, isFileUrl } from '@shared/utils'
import { hasPaperTranslationResult } from '@shared/utils/paperTranslation'
import { OCR_TEST_TIMEOUT } from '@main/constants/timeouts'
import type {
  CreatePaperAnnotationPayload,
  PaperStatus,
  PaperTranslationSummary,
  UpdatePaperAnnotationPayload
} from '@shared/types/paper'
import { statSync } from 'fs'
import { readFile } from 'fs/promises'

export function registerPaperHandlers(): void {
  const translationProgressCleanupByKey = new Map<string, () => void>()
  const translationProgressBatchCleanupByKey = new Map<string, () => void>()
  const legacyTranslationProgressSubscriberCountBySender = new Map<number, number>()

  const hasLegacyTranslationSubscriber = (sender: Electron.WebContents): boolean => {
    return (legacyTranslationProgressSubscriberCountBySender.get(sender.id) || 0) > 0
  }

  const registerLegacyTranslationSubscriber = (sender: Electron.WebContents): void => {
    const currentCount = legacyTranslationProgressSubscriberCountBySender.get(sender.id) || 0
    legacyTranslationProgressSubscriberCountBySender.set(sender.id, currentCount + 1)

    if (currentCount === 0) {
      sender.once('destroyed', () => {
        legacyTranslationProgressSubscriberCountBySender.delete(sender.id)
      })
    }
  }

  const unregisterLegacyTranslationSubscriber = (sender: Electron.WebContents): void => {
    const currentCount = legacyTranslationProgressSubscriberCountBySender.get(sender.id) || 0
    if (currentCount <= 1) {
      legacyTranslationProgressSubscriberCountBySender.delete(sender.id)
      return
    }

    legacyTranslationProgressSubscriberCountBySender.set(sender.id, currentCount - 1)
  }

  const registerTranslationSubscriber = (paperId: string, sender: Electron.WebContents): void => {
    const subscriptionKey = `${paperId}:${sender.id}`
    if (translationProgressCleanupByKey.has(subscriptionKey)) {
      return
    }

    const cleanup = paperTranslationService.onProgress(paperId, (progress) => {
      try {
        if (sender.isDestroyed()) {
          const release = translationProgressCleanupByKey.get(subscriptionKey)
          release?.()
          translationProgressCleanupByKey.delete(subscriptionKey)
          return
        }

        const win = BrowserWindow.fromWebContents(sender)
        if (win && !win.isDestroyed()) {
          win.webContents.send('paper:translationProgress', progress)
        }
      } catch {
        const release = translationProgressCleanupByKey.get(subscriptionKey)
        release?.()
        translationProgressCleanupByKey.delete(subscriptionKey)
      }
    })

    translationProgressCleanupByKey.set(subscriptionKey, cleanup)

    sender.once('destroyed', () => {
      const release = translationProgressCleanupByKey.get(subscriptionKey)
      release?.()
      translationProgressCleanupByKey.delete(subscriptionKey)
    })
  }

  const registerTranslationBatchSubscriber = (
    paperId: string,
    sender: Electron.WebContents
  ): void => {
    const subscriptionKey = `${paperId}:${sender.id}`
    if (translationProgressBatchCleanupByKey.has(subscriptionKey)) {
      return
    }

    const cleanup = paperTranslationService.onProgressBatch(paperId, (batch) => {
      try {
        if (sender.isDestroyed()) {
          const release = translationProgressBatchCleanupByKey.get(subscriptionKey)
          release?.()
          translationProgressBatchCleanupByKey.delete(subscriptionKey)
          return
        }

        const win = BrowserWindow.fromWebContents(sender)
        if (win && !win.isDestroyed()) {
          win.webContents.send('paper:translationProgressBatch', batch)
        }
      } catch {
        const release = translationProgressBatchCleanupByKey.get(subscriptionKey)
        release?.()
        translationProgressBatchCleanupByKey.delete(subscriptionKey)
      }
    })

    translationProgressBatchCleanupByKey.set(subscriptionKey, cleanup)

    sender.once('destroyed', () => {
      const release = translationProgressBatchCleanupByKey.get(subscriptionKey)
      release?.()
      translationProgressBatchCleanupByKey.delete(subscriptionKey)
    })
  }

  ipcMain.handle(
    'paper:create',
    async (_event, params: { sourcePdfPath: string; pageCount: number }) => {
      const preset = getOcrProviderPreset(DEFAULT_OCR_PROVIDER)
      const result = await paperStorageService.createPaper(
        params.sourcePdfPath,
        preset?.modelName ?? DEFAULT_OCR_PROVIDER,
        params.pageCount
      )
      if (result.success) {
        await getFileService().registerPaperFile(result.data!)
        logger.info('IPC: 论文创建成功', 'main', { paperId: result.data?.id })
      } else {
        logger.warn('IPC: 论文创建失败', 'main', { error: result.error })
      }
      return result
    }
  )

  ipcMain.handle('paper:list', async () => {
    const result = await paperStorageService.listPapers()
    if (!result.success) {
      logger.warn('IPC: 获取论文列表失败', 'main', { error: result.error })
    }
    return result
  })

  ipcMain.handle('paper:get', async (_event, paperId: string) => {
    const result = await paperStorageService.readMeta(paperId)
    if (result.success) {
      await paperStorageService.updateMeta(paperId, { lastOpenedAt: new Date().toISOString() })
    }
    return result
  })

  ipcMain.handle(
    'paper:setChatSession',
    async (_event, params: { paperId: string; sessionId: string }) => {
      return await paperStorageService.updateMeta(params.paperId, {
        chatSessionId: params.sessionId
      })
    }
  )

  ipcMain.handle(
    'paper:saveReadingProgress',
    async (
      _event,
      params: {
        paperId: string
        scrollPercentOriginal?: number
        scrollPercentTranslated?: number
        zoomLevel: number
        translationVisible: boolean
      }
    ) => {
      // 读取已有进度以保留未更新的字段
      const existingResult = await paperStorageService.readMeta(params.paperId)
      const existing = existingResult.success ? existingResult.data?.readingProgress : undefined

      return await paperStorageService.updateMeta(params.paperId, {
        readingProgress: {
          scrollPercentOriginal:
            params.scrollPercentOriginal ?? existing?.scrollPercentOriginal ?? 0,
          scrollPercentTranslated:
            params.scrollPercentTranslated ?? existing?.scrollPercentTranslated ?? 0,
          zoomLevel: params.zoomLevel,
          readAt: new Date().toISOString(),
          translationVisible: params.translationVisible
        }
      })
    }
  )

  ipcMain.handle('paper:delete', async (_event, paperId: string) => {
    const result = await getPaperService().deletePaper(paperId)
    if (result.success) {
      logger.info('IPC: 论文删除成功', 'main', { paperId })
    } else {
      logger.warn('IPC: 论文删除失败', 'main', { paperId, error: result.error })
    }
    return result
  })

  /**
   * 选择 PDF 文件
   * 返回: { path: string, name: string, size: number } | null
   */
  ipcMain.handle('paper:selectPdfFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'PDF 文件', extensions: ['pdf'] }]
      })
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      const filePath = result.filePaths[0]
      const stats = statSync(filePath)
      return {
        path: filePath,
        name: filePath.split('/').pop() || 'unknown.pdf',
        size: stats.size
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('IPC: 选择 PDF 文件失败', 'main', { error: errorMessage })
      return null
    }
  })

  /**
   * 读取本地文件内容为 base64（用于渲染进程无法直接 fetch file:// 的场景）
   * 返回: { success: boolean, data?: string (base64), error?: string }
   */
  ipcMain.handle('paper:readFileAsBase64', async (_event, filePath: string) => {
    try {
      const resolvedFilePath = isFileUrl(filePath) ? fileUrlToPath(filePath) || filePath : filePath
      const buffer = await readFile(resolvedFilePath)
      return { success: true, data: buffer.toString('base64') }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('IPC: 读取文件失败', 'main', { filePath, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  /**
   * 上传 PDF 并创建论文记录（不含渲染）
   * 参数: { sourcePdfPath: string, pageCount: number }
   */
  ipcMain.handle(
    'paper:uploadPdf',
    async (_event, params: { sourcePdfPath: string; pageCount: number }) => {
      const preset = getOcrProviderPreset(DEFAULT_OCR_PROVIDER)
      const result = await paperStorageService.createPaper(
        params.sourcePdfPath,
        preset?.modelName ?? DEFAULT_OCR_PROVIDER,
        params.pageCount
      )
      if (result.success) {
        const updateResult = await paperStorageService.updateMeta(result.data!.id, {
          status: 'rendering'
        })
        await getFileService().registerPaperFile(updateResult.data || result.data!)
        logger.info('IPC: PDF 上传成功', 'main', { paperId: result.data?.id })
      }
      return result
    }
  )

  /**
   * 保存单页图片
   * 参数: { paperId: string, pageIndex: number, base64Data: string }
   */
  ipcMain.handle(
    'paper:savePageImage',
    async (
      _event,
      params: {
        paperId: string
        pageIndex: number
        base64Data: string
        imageWidth: number
        imageHeight: number
        sourceWidth?: number
        sourceHeight?: number
        renderScale: number
      }
    ) => {
      return await paperStorageService.savePageImage(
        params.paperId,
        params.pageIndex,
        params.base64Data,
        {
          imageWidth: params.imageWidth,
          imageHeight: params.imageHeight,
          sourceWidth: params.sourceWidth,
          sourceHeight: params.sourceHeight,
          renderScale: params.renderScale
        }
      )
    }
  )

  /**
   * 获取指定页图片（base64）
   * 参数: { paperId: string, pageIndex: number }
   */
  ipcMain.handle(
    'paper:getPageImage',
    async (_event, params: { paperId: string; pageIndex: number }) => {
      return await paperStorageService.readPageImage(params.paperId, params.pageIndex)
    }
  )

  /**
   * 更新论文状态
   * 参数: { paperId: string, status: PaperStatus, errorMessage?: string }
   */
  ipcMain.handle(
    'paper:updateStatus',
    async (_event, params: { paperId: string; status: PaperStatus; errorMessage?: string }) => {
      return await paperStorageService.updateMeta(params.paperId, {
        status: params.status,
        errorMessage: params.errorMessage
      })
    }
  )

  ipcMain.handle('paper:getMergedMd', async (_event, paperId: string) => {
    return await paperStorageService.readMergedMd(paperId)
  })

  ipcMain.handle('paper:getReaderMarkdown', async (_event, paperId: string) => {
    return getPaperService().getReaderMarkdown(paperId)
  })

  ipcMain.handle('paper:getReaderDocument', async (_event, paperId: string) => {
    return getPaperService().getReaderDocument(paperId)
  })

  ipcMain.handle('paper:listFigures', async (_event, paperId: string) => {
    return getPaperService().listFigures(paperId)
  })

  ipcMain.handle('paper:listAnnotations', async (_event, paperId: string) => {
    return getPaperService().listAnnotations(paperId)
  })

  ipcMain.handle('paper:createAnnotation', async (_event, params: CreatePaperAnnotationPayload) => {
    return getPaperService().createAnnotation(params)
  })

  ipcMain.handle('paper:updateAnnotation', async (_event, params: UpdatePaperAnnotationPayload) => {
    return getPaperService().updateAnnotation(params)
  })

  ipcMain.handle(
    'paper:deleteAnnotation',
    async (_event, params: { paperId: string; annotationId: string }) => {
      return getPaperService().deleteAnnotation(params.paperId, params.annotationId)
    }
  )

  ipcMain.handle(
    'paper:saveMergedMd',
    async (_event, params: { paperId: string; content: string }) => {
      return await paperStorageService.saveMergedMd(params.paperId, params.content)
    }
  )

  ipcMain.handle(
    'paper:testOcrConnection',
    async (_event, params: { provider: OcrProviderId; apiKey: string }) => {
      const preset = getOcrProviderPreset(params.provider)
      if (!preset) {
        return { success: false, error: '未知的 OCR 服务提供商' }
      }

      if (!params.apiKey?.trim()) {
        return { success: false, error: '请先填写 API Key' }
      }

      try {
        const testImageUrl = 'https://cdn.bigmodel.cn/static/logo/introduction.png'

        const body = JSON.stringify({
          model: preset.modelName,
          file: testImageUrl,
          return_crop_images: false,
          need_layout_visualization: false
        })

        const response = await net.fetch(preset.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${params.apiKey.trim()}`
          },
          body,
          signal: AbortSignal.timeout(OCR_TEST_TIMEOUT)
        })

        if (response.status === 401 || response.status === 403) {
          return { success: false, error: 'API Key 无效或已过期' }
        }

        if (response.status === 429) {
          return { success: false, error: 'API 调用额度已用尽，请稍后再试' }
        }

        if (response.status >= 500) {
          return { success: false, error: `服务端错误（${response.status}），请稍后再试` }
        }

        if (!response.ok) {
          return { success: false, error: `请求失败（${response.status}），请检查配置后重试` }
        }

        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('abort') || errorMessage.includes('timeout')) {
          return { success: false, error: '连接超时，请检查网络后重试' }
        }
        logger.error('OCR 连接测试失败', 'main', { error: errorMessage })
        return { success: false, error: `网络连接失败，请检查网络后重试` }
      }
    }
  )

  ipcMain.handle('paper:startOcr', async (_event, paperId: string) => {
    const paperService = getPaperService()

    const sender = _event.sender
    paperService.onOcrProgress(paperId, (progress: OcrProgressInfo) => {
      try {
        if (!sender.isDestroyed()) {
          const win = BrowserWindow.fromWebContents(sender)
          if (win && !win.isDestroyed()) {
            win.webContents.send('paper:ocrProgress', progress)
          }
        }
      } catch {
        paperService.offOcrProgress(paperId)
      }
    })

    try {
      const result = await paperService.startOcr(paperId)
      if (!result.success) {
        logger.warn('IPC: OCR 启动失败', 'main', { paperId, error: result.error })
      }
      return result
    } finally {
      paperService.offOcrProgress(paperId)
    }
  })

  ipcMain.handle('paper:cancelOcr', (_event, paperId: string) => {
    getPaperService().cancelOcr(paperId)
    return { success: true }
  })

  ipcMain.handle('paper:getOcrProgress', (_event, paperId: string) => {
    const progress = getPaperService().getOcrProgress(paperId)
    return { success: true, data: progress }
  })

  ipcMain.handle('paper:isOcrActive', (_event, paperId: string) => {
    return { success: true, data: getPaperService().isOcrActive(paperId) }
  })

  ipcMain.handle(
    'paper:retryPage',
    async (_event, params: { paperId: string; pageIndex: number }) => {
      return getPaperService().retryPage(params.paperId, params.pageIndex)
    }
  )

  ipcMain.handle('paper:getTranslationState', async (_event, paperId: string) => {
    const payloadResult = await getPaperService().getReaderPayload(paperId)
    if (!payloadResult.success || !payloadResult.data) {
      return { success: false, error: payloadResult.error || '读取论文正文失败' }
    }

    const stateResult = await paperTranslationService.getTranslationState(
      paperId,
      payloadResult.data.readerDocument.markdown,
      payloadResult.data.figures
    )
    if (stateResult.success && stateResult.data?.isRunning) {
      if (hasLegacyTranslationSubscriber(_event.sender)) {
        registerTranslationSubscriber(paperId, _event.sender)
      }
      registerTranslationBatchSubscriber(paperId, _event.sender)
    }

    return stateResult
  })

  ipcMain.handle('paper:listTranslationStatus', async (_event, paperIds: string[]) => {
    const statuses: Record<string, boolean> = {}

    for (const paperId of paperIds) {
      const cacheResult = await paperStorageService.readTranslationCache(paperId)
      statuses[paperId] =
        !!cacheResult.success && !!cacheResult.data && hasPaperTranslationResult(cacheResult.data)
    }

    return { success: true, data: statuses }
  })

  ipcMain.handle('paper:listTranslationSummaries', async (_event, paperIds: string[]) => {
    const summaries: Record<string, PaperTranslationSummary> = {}

    for (const paperId of paperIds) {
      const cacheResult = await paperStorageService.readTranslationCache(paperId)
      const cache = cacheResult.success ? cacheResult.data : undefined
      summaries[paperId] = {
        paperId,
        hasTranslation: hasPaperTranslationResult(cache)
      }
    }

    return { success: true, data: summaries }
  })

  ipcMain.handle('paper:subscribeTranslationProgress', (_event) => {
    registerLegacyTranslationSubscriber(_event.sender)
    return { success: true }
  })

  ipcMain.handle('paper:unsubscribeTranslationProgress', (_event) => {
    unregisterLegacyTranslationSubscriber(_event.sender)
    return { success: true }
  })

  ipcMain.handle('paper:deleteTranslation', async (_event, paperId: string) => {
    paperTranslationService.cancelTranslation(paperId)
    return getPaperService().deleteTranslation(paperId)
  })

  ipcMain.handle('paper:startTranslation', async (_event, params: { paperId: string }) => {
    const { paperId } = params
    const payloadResult = await getPaperService().getReaderPayload(paperId)
    if (!payloadResult.success || !payloadResult.data) {
      return { success: false, error: payloadResult.error || '读取论文正文失败' }
    }

    if (hasLegacyTranslationSubscriber(_event.sender)) {
      registerTranslationSubscriber(paperId, _event.sender)
    }
    registerTranslationBatchSubscriber(paperId, _event.sender)

    try {
      return await paperTranslationService.startTranslation(
        paperId,
        payloadResult.data.readerDocument.markdown,
        payloadResult.data.figures
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('IPC: 启动论文翻译失败', 'main', { paperId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'paper:retranslateSegment',
    async (_event, params: { paperId: string; segmentId: string }) => {
      const { paperId, segmentId } = params
      const payloadResult = await getPaperService().getReaderPayload(paperId)
      if (!payloadResult.success || !payloadResult.data) {
        return { success: false, error: payloadResult.error || '读取论文正文失败' }
      }

      if (hasLegacyTranslationSubscriber(_event.sender)) {
        registerTranslationSubscriber(paperId, _event.sender)
      }
      registerTranslationBatchSubscriber(paperId, _event.sender)

      try {
        return await paperTranslationService.retranslateSegment(
          paperId,
          payloadResult.data.readerDocument.markdown,
          payloadResult.data.figures,
          segmentId
        )
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('IPC: 段落重新翻译失败', 'main', { paperId, segmentId, error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )
}
