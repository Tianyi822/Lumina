import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import { writerService } from '@main/services/writer'
import type {
  WriterAsset,
  WriterDocument,
  WriterFolder,
  WriterIndex,
  WriterResult
} from '@shared/types/writer'
import {
  validateDeleteWriterPayload,
  validateImportWriterAssetPayload,
  validateSaveWriterPayload,
  validateWriterFavorite,
  validateWriterFolderId,
  validateWriterFolderName,
  validateWriterTitle
} from './writerValidation'
import type { ImportWriterAssetPayload } from './writerValidation'

interface RenameWriterPayload {
  documentId: string
  title: string
}

interface MoveWriterPayload {
  documentId: string
  folderId?: string
}

interface SetWriterFavoritePayload {
  documentId: string
  favorite: boolean
}

interface RenameWriterFolderPayload {
  folderId: string
  name: string
}

let writerHandlersRegistered = false

function invalidInput<T>(error: string): WriterResult<T> {
  return { success: false, code: 'invalid_input', error }
}

async function invokeWriter<T>(
  operationName: string,
  operation: () => Promise<WriterResult<T>>
): Promise<WriterResult<T>> {
  try {
    return await operation()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    logger.error(`${operationName}失败`, 'main', { error: detail })
    return { success: false, code: 'io_error', error: `${operationName}失败` }
  }
}

/** 注册写作工作区 IPC 处理程序 */
export function registerWriterHandlers(): void {
  if (writerHandlersRegistered) {
    logger.warn('写作 IPC 处理程序已注册，跳过重复注册', 'main')
    return
  }
  writerHandlersRegistered = true

  ipcMain.handle('writer:list', (): Promise<WriterResult<WriterIndex>> => {
    return invokeWriter('读取写作文档列表', () => writerService.listDocuments())
  })

  ipcMain.handle(
    'writer:create',
    (_event, title?: unknown): Promise<WriterResult<WriterDocument>> => {
      const validationError = validateWriterTitle(title, true)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('创建写作文档', () =>
        writerService.createDocument(title as string | undefined)
      )
    }
  )

  ipcMain.handle(
    'writer:get',
    (_event, documentId: unknown): Promise<WriterResult<WriterDocument>> => {
      const validationError = validateDeleteWriterPayload(documentId)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('读取写作文档', () => writerService.getDocument(documentId as string))
    }
  )

  ipcMain.handle(
    'writer:save',
    (_event, request: unknown): Promise<WriterResult<WriterDocument>> => {
      if (!validateSaveWriterPayload(request)) {
        return Promise.resolve(invalidInput('无效的保存请求'))
      }
      return invokeWriter('保存写作文档', () => writerService.saveDocument(request))
    }
  )

  ipcMain.handle('writer:delete', (_event, documentId: unknown): Promise<WriterResult<void>> => {
    const validationError = validateDeleteWriterPayload(documentId)
    if (validationError) {
      return Promise.resolve(invalidInput(validationError))
    }
    return invokeWriter('永久删除写作文档', () =>
      writerService.deleteDocument(documentId as string)
    )
  })

  ipcMain.handle(
    'writer:rename',
    (_event, payload: RenameWriterPayload): Promise<WriterResult<WriterDocument>> => {
      const validationError =
        validateDeleteWriterPayload(payload?.documentId) ??
        validateWriterTitle(payload?.title, false)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('重命名写作文档', () =>
        writerService.renameDocument(payload.documentId, payload.title)
      )
    }
  )

  ipcMain.handle(
    'writer:move',
    (_event, payload: MoveWriterPayload): Promise<WriterResult<WriterDocument>> => {
      const validationError =
        validateDeleteWriterPayload(payload?.documentId) ??
        validateWriterFolderId(payload?.folderId, true)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('移动写作文档', () =>
        writerService.moveDocument(payload.documentId, payload.folderId)
      )
    }
  )

  ipcMain.handle(
    'writer:setFavorite',
    (_event, payload: SetWriterFavoritePayload): Promise<WriterResult<WriterDocument>> => {
      const validationError =
        validateDeleteWriterPayload(payload?.documentId) ??
        validateWriterFavorite(payload?.favorite)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('更新写作文档收藏状态', () =>
        writerService.setFavorite(payload.documentId, payload.favorite)
      )
    }
  )

  ipcMain.handle(
    'writer:createFolder',
    (_event, name: unknown): Promise<WriterResult<WriterFolder>> => {
      const validationError = validateWriterFolderName(name)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('创建写作文件夹', () => writerService.createFolder(name as string))
    }
  )

  ipcMain.handle(
    'writer:renameFolder',
    (_event, payload: RenameWriterFolderPayload): Promise<WriterResult<WriterFolder>> => {
      const validationError =
        validateWriterFolderId(payload?.folderId) ?? validateWriterFolderName(payload?.name)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('重命名写作文件夹', () =>
        writerService.renameFolder(payload.folderId, payload.name)
      )
    }
  )

  ipcMain.handle(
    'writer:deleteFolder',
    (_event, folderId: unknown): Promise<WriterResult<void>> => {
      const validationError = validateWriterFolderId(folderId)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('删除写作文件夹', () => writerService.deleteFolder(folderId as string))
    }
  )

  ipcMain.handle(
    'writer:importAsset',
    (_event, payload: unknown): Promise<WriterResult<WriterAsset>> => {
      const validationError = validateImportWriterAssetPayload(payload)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      const validPayload = payload as ImportWriterAssetPayload
      return invokeWriter('导入写作图片', () =>
        writerService.importAsset(validPayload.documentId, {
          fileName: validPayload.fileName,
          declaredMimeType: validPayload.declaredMimeType,
          bytes: validPayload.bytes
        })
      )
    }
  )

  ipcMain.handle('writer:flush-ack', (event): WriterResult<void> => {
    writerService.acknowledgeRendererFlush(event.sender.id)
    return { success: true }
  })
}
