import { logger } from '@main/services/logger'
import type {
  SaveWriterDocumentRequest,
  WriterAsset,
  WriterAssetImportInput,
  WriterDocument,
  WriterFolder,
  WriterIndex,
  WriterResult
} from '@shared/types/writer'
import type { WriterAssetService } from './WriterAssetService'
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

export type WriterAssetPort = Pick<WriterAssetService, 'importBytes'>

interface WriterServiceOptions {
  storageService: WriterStoragePort
  assetService: WriterAssetPort
  flushCoordinator: WriterFlushCoordinator
  getWebContentsIds: () => number[]
}

/** 写作子系统的服务编排入口 */
export class WriterService {
  private readonly storageService: WriterStoragePort
  private readonly assetService: WriterAssetPort
  private readonly flushCoordinator: WriterFlushCoordinator
  private readonly getWebContentsIds: () => number[]
  private saveTail: Promise<void> = Promise.resolve()

  constructor(options: WriterServiceOptions) {
    this.storageService = options.storageService
    this.assetService = options.assetService
    this.flushCoordinator = options.flushCoordinator
    this.getWebContentsIds = options.getWebContentsIds
  }

  initialize(): Promise<WriterResult<WriterIndex>> {
    return this.runOperation('初始化写作服务失败', () => this.storageService.initialize())
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
    return this.enqueueSave('保存写作文档失败', () => this.storageService.saveDocument(request))
  }

  deleteDocument(documentId: string): Promise<WriterResult<void>> {
    return this.runOperation('永久删除写作文档失败', () =>
      this.storageService.deleteDocument(documentId)
    )
  }

  renameDocument(documentId: string, title: string): Promise<WriterResult<WriterDocument>> {
    return this.enqueueSave('重命名写作文档失败', async () => {
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
    return this.runOperation('导入写作图片失败', () =>
      this.assetService.importBytes(documentId, input)
    )
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
    await this.saveTail
  }

  private enqueueSave<T>(
    errorMessage: string,
    operation: () => Promise<WriterResult<T>>
  ): Promise<WriterResult<T>> {
    const next = this.saveTail.then(() => this.runOperation(errorMessage, operation))
    this.saveTail = next.then(
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
}
