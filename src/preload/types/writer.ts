import type {
  SaveWriterDocumentRequest,
  WriterAsset,
  WriterDocument,
  WriterExportFormat,
  WriterExportOutcome,
  WriterFolder,
  WriterIndex,
  WriterResult
} from '@shared/types/writer'

export type {
  SaveWriterDocumentRequest,
  WriterAsset,
  WriterDocument,
  WriterExportFormat,
  WriterExportOutcome,
  WriterFolder,
  WriterIndex,
  WriterResult
} from '@shared/types/writer'

export interface WriterApi {
  list: () => Promise<WriterResult<WriterIndex>>
  create: (title?: string) => Promise<WriterResult<WriterDocument>>
  get: (documentId: string) => Promise<WriterResult<WriterDocument>>
  save: (request: SaveWriterDocumentRequest) => Promise<WriterResult<WriterDocument>>
  delete: (documentId: string) => Promise<WriterResult<void>>
  rename: (documentId: string, title: string) => Promise<WriterResult<WriterDocument>>
  move: (documentId: string, folderId?: string) => Promise<WriterResult<WriterDocument>>
  setFavorite: (documentId: string, favorite: boolean) => Promise<WriterResult<WriterDocument>>
  createFolder: (name: string) => Promise<WriterResult<WriterFolder>>
  renameFolder: (folderId: string, name: string) => Promise<WriterResult<WriterFolder>>
  deleteFolder: (folderId: string) => Promise<WriterResult<void>>
  importAsset: (
    documentId: string,
    fileName: string,
    declaredMimeType: string,
    bytes: Uint8Array
  ) => Promise<WriterResult<WriterAsset>>
  collectGarbage: (documentId: string) => Promise<WriterResult<number>>
  exportDocument: (
    documentId: string,
    format: WriterExportFormat
  ) => Promise<WriterResult<WriterExportOutcome>>
  onFlushRequested: (callback: () => Promise<void> | void) => () => void
  acknowledgeFlush: () => Promise<void>
}
