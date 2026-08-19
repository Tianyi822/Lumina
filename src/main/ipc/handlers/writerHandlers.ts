import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import { t } from '@main/services/i18n'
import { writerService } from '@main/services/writer'
import { acknowledgeWriterFlushFromEvent } from '@main/services/writer/WriterFlushCoordinator'
import type { WriterOperationKey } from '@main/services/writer/writerOperationKeys'
import type {
  WriterAsset,
  WriterDocument,
  WriterExportFormat,
  WriterExportOutcome,
  WriterFolder,
  WriterIndex,
  WriterResult
} from '@shared/types/writer'
import {
  validateDeleteWriterPayload,
  validateImportWriterAssetPayload,
  validateSaveWriterPayload,
  validateWriterExportFormat,
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
  operationKey: WriterOperationKey,
  operation: () => Promise<WriterResult<T>>
): Promise<WriterResult<T>> {
  try {
    return await operation()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const message = t('notifications.writer.operationFailed', { operation: t(operationKey) })
    logger.error(message, 'main', { error: detail })
    return { success: false, code: 'io_error', error: message }
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
    return invokeWriter('notifications.writer.operations.listDocuments', () =>
      writerService.listDocuments()
    )
  })

  ipcMain.handle(
    'writer:create',
    (_event, title?: unknown): Promise<WriterResult<WriterDocument>> => {
      const validationError = validateWriterTitle(title, true)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('notifications.writer.operations.createDocument', () =>
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
      return invokeWriter('notifications.writer.operations.readDocument', () =>
        writerService.getDocument(documentId as string)
      )
    }
  )

  ipcMain.handle(
    'writer:save',
    (_event, request: unknown): Promise<WriterResult<WriterDocument>> => {
      if (!validateSaveWriterPayload(request)) {
        return Promise.resolve(invalidInput(t('notifications.writer.invalidSaveRequest')))
      }
      return invokeWriter('notifications.writer.operations.saveDocument', () =>
        writerService.saveDocument(request)
      )
    }
  )

  ipcMain.handle('writer:delete', (_event, documentId: unknown): Promise<WriterResult<void>> => {
    const validationError = validateDeleteWriterPayload(documentId)
    if (validationError) {
      return Promise.resolve(invalidInput(validationError))
    }
    return invokeWriter('notifications.writer.operations.deleteDocument', () =>
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
      return invokeWriter('notifications.writer.operations.renameDocument', () =>
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
      return invokeWriter('notifications.writer.operations.moveDocument', () =>
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
      return invokeWriter('notifications.writer.operations.updateFavorite', () =>
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
      return invokeWriter('notifications.writer.operations.createFolder', () =>
        writerService.createFolder(name as string)
      )
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
      return invokeWriter('notifications.writer.operations.renameFolder', () =>
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
      return invokeWriter('notifications.writer.operations.deleteFolder', () =>
        writerService.deleteFolder(folderId as string)
      )
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
      return invokeWriter('notifications.writer.operations.importAsset', () =>
        writerService.importAsset(validPayload.documentId, {
          fileName: validPayload.fileName,
          declaredMimeType: validPayload.declaredMimeType,
          bytes: validPayload.bytes
        })
      )
    }
  )

  ipcMain.handle('writer:flush-ack', (event): WriterResult<void> => {
    return acknowledgeWriterFlushFromEvent(event, (webContentsId) =>
      writerService.acknowledgeRendererFlush(webContentsId)
    )
  })

  ipcMain.handle(
    'writer:collectGarbage',
    (_event, documentId: unknown): Promise<WriterResult<number>> => {
      const validationError = validateDeleteWriterPayload(documentId)
      if (validationError) {
        return Promise.resolve(invalidInput(validationError))
      }
      return invokeWriter('notifications.writer.operations.cleanupAssets', () =>
        writerService.collectDocumentGarbage(documentId as string)
      )
    }
  )

  ipcMain.handle(
    'writer:exportDocument',
    (_event, documentId: unknown, format: unknown): Promise<WriterResult<WriterExportOutcome>> => {
      const documentIdError = validateDeleteWriterPayload(documentId)
      if (documentIdError) {
        return Promise.resolve(invalidInput(documentIdError))
      }
      const formatError = validateWriterExportFormat(format)
      if (formatError) {
        return Promise.resolve(invalidInput(formatError))
      }
      return invokeWriter('notifications.writer.operations.exportDocument', () =>
        writerService.exportDocument(documentId as string, format as WriterExportFormat)
      )
    }
  )
}
