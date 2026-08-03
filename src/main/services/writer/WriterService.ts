import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { logger } from '@main/services/logger'
import type {
  SaveWriterDocumentRequest,
  WriterAsset,
  WriterAssetImportInput,
  WriterDocument,
  WriterExportDocument,
  WriterExportFormat,
  WriterExportOutcome,
  WriterFolder,
  WriterIndex,
  WriterJsonNode,
  WriterResult
} from '@shared/types/writer'
import type { WriterAssetService } from './WriterAssetService'
import { WriterDocumentMapper } from './WriterDocumentMapper'
import { WriterDocxExporter } from './WriterDocxExporter'
import { WriterFormulaRasterizer } from './WriterFormulaRasterizer'
import { WriterMarkdownExporter, sanitizeExportBaseName } from './WriterMarkdownExporter'
import { WriterPrintExporter } from './WriterPrintExporter'
import { WriterPrintHtmlRenderer } from './WriterPrintHtmlRenderer'
import type { WriterStorageService } from './WriterStorageService'
import type { WriterFlushCoordinator } from './WriterFlushCoordinator'

export type WriterStoragePort = Pick<
  WriterStorageService,
  | 'initialize'
  | 'createDocument'
  | 'listDocuments'
  | 'getDocument'
  | 'saveDocument'
  | 'deleteDocument'
  | 'createFolder'
  | 'renameFolder'
  | 'deleteFolder'
  | 'moveDocument'
  | 'setFavorite'
>

export type WriterAssetPort = Pick<WriterAssetService, 'importBytes'> &
  Partial<Pick<WriterAssetService, 'collectGarbage'>>

/** 导出对话框端口：便于测试注入，默认延迟加载 electron.dialog */
export interface WriterExportDialogPort {
  showSaveDialog: (options: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }) => Promise<{ canceled: boolean; filePath?: string }>
  showMessageBox: (options: {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning'
    buttons: string[]
    cancelId?: number
    defaultId?: number
    title?: string
    message: string
  }) => Promise<{ response: number }>
}

interface WriterServiceOptions {
  storageService: WriterStoragePort
  assetService: WriterAssetPort
  flushCoordinator: WriterFlushCoordinator
  getWebContentsIds: () => number[]
  documentMapper?: WriterDocumentMapper
  markdownExporter?: WriterMarkdownExporter
  docxExporter?: WriterDocxExporter
  printExporter?: WriterPrintExporter
  exportDialog?: WriterExportDialogPort
}

/** 写作子系统的服务编排入口 */
export class WriterService {
  private readonly storageService: WriterStoragePort
  private readonly assetService: WriterAssetPort
  private readonly flushCoordinator: WriterFlushCoordinator
  private readonly getWebContentsIds: () => number[]
  private readonly documentMapper: WriterDocumentMapper
  private readonly markdownExporter: WriterMarkdownExporter
  private readonly docxExporter: WriterDocxExporter
  private readonly printExporter: WriterPrintExporter
  private readonly exportDialog: WriterExportDialogPort
  private mutationTail: Promise<void> = Promise.resolve()

  constructor(options: WriterServiceOptions) {
    this.storageService = options.storageService
    this.assetService = options.assetService
    this.flushCoordinator = options.flushCoordinator
    this.getWebContentsIds = options.getWebContentsIds
    this.documentMapper = options.documentMapper ?? new WriterDocumentMapper()
    this.markdownExporter = options.markdownExporter ?? new WriterMarkdownExporter()
    this.docxExporter =
      options.docxExporter ?? new WriterDocxExporter(new WriterFormulaRasterizer())
    this.printExporter =
      options.printExporter ?? new WriterPrintExporter(new WriterPrintHtmlRenderer())
    this.exportDialog = options.exportDialog ?? createDefaultExportDialog()
  }

  async initialize(): Promise<WriterResult<WriterIndex>> {
    const result = await this.runOperation('初始化写作服务失败', () =>
      this.storageService.initialize()
    )
    if (result.success && result.data) {
      await this.collectDocumentsGarbage(result.data.documents.map((document) => document.id))
    }
    return result
  }

  listDocuments(): Promise<WriterResult<WriterIndex>> {
    return this.runOperation('读取写作文档列表失败', () => this.storageService.listDocuments())
  }

  createDocument(title?: string): Promise<WriterResult<WriterDocument>> {
    return this.runOperation('创建写作文档失败', () => this.storageService.createDocument(title))
  }

  getDocument(documentId: string): Promise<WriterResult<WriterDocument>> {
    return this.runOperation('读取写作文档失败', () => this.storageService.getDocument(documentId))
  }

  saveDocument(request: SaveWriterDocumentRequest): Promise<WriterResult<WriterDocument>> {
    return this.enqueueMutation('保存写作文档失败', () => this.storageService.saveDocument(request))
  }

  deleteDocument(documentId: string): Promise<WriterResult<void>> {
    return this.enqueueMutation('永久删除写作文档失败', () =>
      this.storageService.deleteDocument(documentId)
    )
  }

  renameDocument(documentId: string, title: string): Promise<WriterResult<WriterDocument>> {
    return this.enqueueMutation('重命名写作文档失败', async () => {
      const current = await this.storageService.getDocument(documentId)
      if (!current.success || !current.data) {
        return current
      }
      return this.storageService.saveDocument({
        documentId,
        expectedRevision: current.data.revision,
        title,
        content: current.data.content
      })
    })
  }

  moveDocument(documentId: string, folderId?: string): Promise<WriterResult<WriterDocument>> {
    return this.runOperation('移动写作文档失败', () =>
      this.storageService.moveDocument(documentId, folderId)
    )
  }

  setFavorite(documentId: string, favorite: boolean): Promise<WriterResult<WriterDocument>> {
    return this.runOperation('更新写作文档收藏状态失败', () =>
      this.storageService.setFavorite(documentId, favorite)
    )
  }

  createFolder(name: string): Promise<WriterResult<WriterFolder>> {
    return this.runOperation('创建写作文件夹失败', () => this.storageService.createFolder(name))
  }

  renameFolder(folderId: string, name: string): Promise<WriterResult<WriterFolder>> {
    return this.runOperation('重命名写作文件夹失败', () =>
      this.storageService.renameFolder(folderId, name)
    )
  }

  deleteFolder(folderId: string): Promise<WriterResult<void>> {
    return this.runOperation('删除写作文件夹失败', () => this.storageService.deleteFolder(folderId))
  }

  importAsset(
    documentId: string,
    input: WriterAssetImportInput
  ): Promise<WriterResult<WriterAsset>> {
    return this.enqueueMutation('导入写作图片失败', async () => {
      const documentResult = await this.storageService.getDocument(documentId)
      if (!documentResult.success || !documentResult.data) {
        return {
          success: false,
          code: documentResult.code ?? 'not_found',
          error: documentResult.error ?? '写作文档不存在'
        }
      }
      return this.assetService.importBytes(documentId, input)
    })
  }

  /**
   * 导出写作文档。支持 Markdown / DOCX / PDF。
   * Markdown 覆盖确认：仅精确检测 `<basename>.assets/`，不使用 glob。
   */
  async exportDocument(
    documentId: string,
    format: WriterExportFormat
  ): Promise<WriterResult<WriterExportOutcome>> {
    return this.runOperation(
      '导出写作文档失败',
      async (): Promise<WriterResult<WriterExportOutcome>> => {
        if (format !== 'markdown' && format !== 'docx' && format !== 'pdf') {
          return {
            success: false,
            code: 'invalid_input',
            error: `暂不支持导出格式：${format}`
          }
        }

        const documentResult = await this.storageService.getDocument(documentId)
        if (!documentResult.success || !documentResult.data) {
          return {
            success: false,
            code: documentResult.code ?? 'not_found',
            error: documentResult.error ?? '写作文档不存在'
          }
        }

        const mapped = this.documentMapper.map(documentResult.data)
        if (!mapped.success || !mapped.data) {
          return {
            success: false,
            code: mapped.code ?? 'invalid_input',
            error: mapped.error ?? '映射写作文档失败'
          }
        }

        if (format === 'markdown') {
          return this.exportMarkdown(documentId, documentResult.data.title, mapped.data)
        }
        if (format === 'docx') {
          return this.exportDocx(documentId, documentResult.data.title, mapped.data)
        }
        return this.exportPdf(documentId, documentResult.data.title, mapped.data)
      }
    )
  }

  private async exportMarkdown(
    documentId: string,
    title: string,
    exportDocument: WriterExportDocument
  ): Promise<WriterResult<WriterExportOutcome>> {
    const defaultName = `${sanitizeExportBaseName(title)}.md`
    const saveResult = await this.exportDialog.showSaveDialog({
      title: '导出 Markdown',
      defaultPath: defaultName,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (saveResult.canceled || !saveResult.filePath) {
      return { success: true, data: { canceled: true } }
    }

    const outputPath = ensureMarkdownExtension(saveResult.filePath)
    const assetsDir = join(dirname(outputPath), `${basename(outputPath, '.md')}.assets`)

    if (existsSync(assetsDir)) {
      const confirm = await this.exportDialog.showMessageBox({
        type: 'warning',
        buttons: ['取消', '覆盖'],
        cancelId: 0,
        defaultId: 0,
        title: '覆盖导出资源',
        message: `目标目录已存在同名资源文件夹：\n${assetsDir}\n\n是否覆盖？`
      })
      if (confirm.response !== 1) {
        return { success: true, data: { canceled: true } }
      }
      // 确认后不在此处删除；由 exporter 在 commit 阶段原子替换，失败时保留原目录
    }

    const exportResult = await this.markdownExporter.export(exportDocument, outputPath)
    if (!exportResult.success) {
      return {
        success: false,
        code: exportResult.code ?? 'io_error',
        error: exportResult.error ?? 'Markdown 导出失败'
      }
    }

    if (exportDocument.warnings.length > 0) {
      logger.warn('写作文档导出含降级警告', 'main', {
        documentId,
        warnings: exportDocument.warnings
      })
    }

    return { success: true, data: { canceled: false, outputPath } }
  }

  private async exportDocx(
    documentId: string,
    title: string,
    exportDocument: WriterExportDocument
  ): Promise<WriterResult<WriterExportOutcome>> {
    const defaultName = `${sanitizeExportBaseName(title)}.docx`
    const saveResult = await this.exportDialog.showSaveDialog({
      title: '导出 DOCX',
      defaultPath: defaultName,
      filters: [{ name: 'Word Document', extensions: ['docx'] }]
    })
    if (saveResult.canceled || !saveResult.filePath) {
      return { success: true, data: { canceled: true } }
    }

    const outputPath = ensureDocxExtension(saveResult.filePath)
    const exportResult = await this.docxExporter.export(exportDocument, outputPath)
    if (!exportResult.success) {
      return {
        success: false,
        code: exportResult.code ?? 'io_error',
        error: exportResult.error ?? 'DOCX 导出失败'
      }
    }

    if (exportDocument.warnings.length > 0) {
      logger.warn('写作文档 DOCX 导出含降级警告', 'main', {
        documentId,
        warnings: exportDocument.warnings
      })
    }

    return { success: true, data: { canceled: false, outputPath } }
  }

  private async exportPdf(
    documentId: string,
    title: string,
    exportDocument: WriterExportDocument
  ): Promise<WriterResult<WriterExportOutcome>> {
    const defaultName = `${sanitizeExportBaseName(title)}.pdf`
    const saveResult = await this.exportDialog.showSaveDialog({
      title: '导出 PDF',
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (saveResult.canceled || !saveResult.filePath) {
      return { success: true, data: { canceled: true } }
    }

    const outputPath = ensurePdfExtension(saveResult.filePath)
    const exportResult = await this.printExporter.export(exportDocument, outputPath)
    if (!exportResult.success) {
      return {
        success: false,
        code: exportResult.code ?? 'io_error',
        error: exportResult.error ?? 'PDF 导出失败'
      }
    }

    if (exportDocument.warnings.length > 0) {
      logger.warn('写作文档 PDF 导出含降级警告', 'main', {
        documentId,
        warnings: exportDocument.warnings
      })
    }

    return { success: true, data: { canceled: false, outputPath } }
  }

  async requestRendererFlush(): Promise<void> {
    try {
      await this.flushCoordinator.requestFlush(this.getWebContentsIds())
    } catch (error) {
      logger.warn('请求 Renderer 刷新写作文档失败，继续退出', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  acknowledgeRendererFlush(webContentsId: number): void {
    this.flushCoordinator.acknowledge(webContentsId)
  }

  async flushPendingSaves(): Promise<void> {
    await this.mutationTail
    const indexResult = await this.runOperation('读取待清理写作文档失败', () =>
      this.storageService.listDocuments()
    )
    if (indexResult.success && indexResult.data) {
      await this.collectDocumentsGarbage(indexResult.data.documents.map((document) => document.id))
    }
  }

  async collectDocumentGarbage(documentId: string): Promise<WriterResult<number>> {
    if (!this.assetService.collectGarbage) {
      return { success: true, data: 0 }
    }
    const documentResult = await this.runOperation('读取待清理写作文档失败', () =>
      this.storageService.getDocument(documentId)
    )
    if (!documentResult.success || !documentResult.data) {
      return {
        success: false,
        code: documentResult.code,
        error: documentResult.error
      }
    }
    const referencedPaths = this.collectReferencedAssets(documentId, documentResult.data.content)
    return this.runOperation('清理写作图片资源失败', () =>
      this.assetService.collectGarbage!(documentId, referencedPaths)
    )
  }

  private enqueueMutation<T>(
    errorMessage: string,
    operation: () => Promise<WriterResult<T>>
  ): Promise<WriterResult<T>> {
    const next = this.mutationTail.then(() => this.runOperation(errorMessage, operation))
    this.mutationTail = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async runOperation<T>(
    errorMessage: string,
    operation: () => Promise<WriterResult<T>>
  ): Promise<WriterResult<T>> {
    try {
      return await operation()
    } catch (error) {
      logger.error(errorMessage, 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, code: 'io_error', error: errorMessage }
    }
  }

  private async collectDocumentsGarbage(documentIds: string[]): Promise<void> {
    for (const documentId of documentIds) {
      const result = await this.collectDocumentGarbage(documentId)
      if (!result.success) {
        logger.warn('写作图片资源清理失败，保留现有资源', 'main', {
          documentId,
          error: result.error,
          code: result.code
        })
      }
    }
  }

  private collectReferencedAssets(
    documentId: string,
    content: WriterDocument['content']
  ): string[] {
    const referencedPaths = new Set<string>()
    const visit = (node: WriterJsonNode): void => {
      if (node.type === 'image' && node.attrs) {
        const assetPath = node.attrs.assetPath
        const src = node.attrs.src
        if (
          typeof assetPath === 'string' &&
          /^assets\/[a-z0-9][a-z0-9.-]*\.(?:png|jpg|webp|gif)$/.test(assetPath) &&
          src === `lumina://writing/${documentId}/${assetPath}`
        ) {
          referencedPaths.add(assetPath)
        }
      }
      for (const child of node.content ?? []) {
        visit(child)
      }
    }
    visit(content)
    return [...referencedPaths].sort()
  }
}

function ensureMarkdownExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith('.md') ? filePath : `${filePath}.md`
}

function ensureDocxExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith('.docx') ? filePath : `${filePath}.docx`
}

function ensurePdfExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith('.pdf') ? filePath : `${filePath}.pdf`
}

/** 延迟加载 electron.dialog，避免测试桩在模块求值期缺少 named export */
function createDefaultExportDialog(): WriterExportDialogPort {
  return {
    async showSaveDialog(options) {
      const { dialog } = await import('electron')
      return dialog.showSaveDialog(options)
    },
    async showMessageBox(options) {
      const { dialog } = await import('electron')
      return dialog.showMessageBox(options)
    }
  }
}
