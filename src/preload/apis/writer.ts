import { ipcRenderer } from 'electron'
import type {
  SaveWriterDocumentRequest,
  WriterAsset,
  WriterDocument,
  WriterFolder,
  WriterIndex,
  WriterResult
} from '@shared/types/writer'
import type { WriterApi } from '../types/writer'

export const writerApi: WriterApi = {
  list: (): Promise<WriterResult<WriterIndex>> => ipcRenderer.invoke('writer:list'),
  create: (title?: string): Promise<WriterResult<WriterDocument>> =>
    ipcRenderer.invoke('writer:create', title),
  get: (documentId: string): Promise<WriterResult<WriterDocument>> =>
    ipcRenderer.invoke('writer:get', documentId),
  save: (request: SaveWriterDocumentRequest): Promise<WriterResult<WriterDocument>> =>
    ipcRenderer.invoke('writer:save', request),
  delete: (documentId: string): Promise<WriterResult<void>> =>
    ipcRenderer.invoke('writer:delete', documentId),
  rename: (documentId: string, title: string): Promise<WriterResult<WriterDocument>> =>
    ipcRenderer.invoke('writer:rename', { documentId, title }),
  move: (documentId: string, folderId?: string): Promise<WriterResult<WriterDocument>> =>
    ipcRenderer.invoke('writer:move', { documentId, folderId }),
  setFavorite: (documentId: string, favorite: boolean): Promise<WriterResult<WriterDocument>> =>
    ipcRenderer.invoke('writer:setFavorite', { documentId, favorite }),
  createFolder: (name: string): Promise<WriterResult<WriterFolder>> =>
    ipcRenderer.invoke('writer:createFolder', name),
  renameFolder: (folderId: string, name: string): Promise<WriterResult<WriterFolder>> =>
    ipcRenderer.invoke('writer:renameFolder', { folderId, name }),
  deleteFolder: (folderId: string): Promise<WriterResult<void>> =>
    ipcRenderer.invoke('writer:deleteFolder', folderId),
  importAsset: (
    documentId: string,
    fileName: string,
    declaredMimeType: string,
    bytes: Uint8Array
  ): Promise<WriterResult<WriterAsset>> =>
    ipcRenderer.invoke('writer:importAsset', {
      documentId,
      fileName,
      declaredMimeType,
      bytes
    }),
  onFlushRequested: (callback: () => Promise<void> | void): (() => void) => {
    const listener = (): void => {
      void Promise.resolve(callback()).catch(() => undefined)
    }
    ipcRenderer.on('writer:flush-request', listener)
    return () => {
      ipcRenderer.removeListener('writer:flush-request', listener)
    }
  },
  acknowledgeFlush: async (): Promise<void> => {
    await ipcRenderer.invoke('writer:flush-ack')
  }
}
