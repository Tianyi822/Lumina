export interface WriterJsonMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface WriterJsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: WriterJsonNode[]
  marks?: WriterJsonMark[]
  text?: string
}

export interface WriterJsonDocument extends WriterJsonNode {
  type: 'doc'
}

export interface WriterFolder {
  id: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface WriterDocument {
  schemaVersion: number
  id: string
  revision: number
  title: string
  content: WriterJsonDocument
  folderId?: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export interface WriterDocumentSummary {
  id: string
  revision: number
  title: string
  folderId?: string
  favorite: boolean
  createdAt: string
  updatedAt: string
}

export interface WriterIndex {
  schemaVersion: number
  folders: WriterFolder[]
  documents: WriterDocumentSummary[]
  recentDocumentIds: string[]
}

export interface WriterResult<T> {
  success: boolean
  data?: T
  error?: string
  code?: 'not_found' | 'invalid_input' | 'revision_conflict' | 'io_error'
}

export interface SaveWriterDocumentRequest {
  documentId: string
  expectedRevision: number
  title: string
  content: WriterJsonDocument
}

export type WriterExportFormat = 'markdown' | 'docx' | 'pdf'
