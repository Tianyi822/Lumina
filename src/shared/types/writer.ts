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

export interface WriterAsset {
  assetId: string
  fileName: string
  relativePath: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  size: number
  sha256: string
  url: string
}

export interface WriterAssetImportInput {
  fileName: string
  declaredMimeType: string
  bytes: Uint8Array
}

export interface SaveWriterDocumentRequest {
  documentId: string
  expectedRevision: number
  title: string
  content: WriterJsonDocument
}

export type WriterExportFormat = 'markdown' | 'docx' | 'pdf'

/** 导出操作结果：取消时 canceled 为 true；成功写出时带最终路径 */
export interface WriterExportOutcome {
  canceled: boolean
  outputPath?: string
}

/** 导出 AST 文本 runs 的样式标记 */
export interface WriterExportTextMarks {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  code?: boolean
  highlight?: boolean
  href?: string
}

/** 段落/标题内的行内片段 */
export type WriterExportRun =
  | { kind: 'text'; text: string; marks?: WriterExportTextMarks }
  | { kind: 'footnoteRef'; number: number }
  | { kind: 'math'; latex: string }

/** 列表项（任务列表可带 checked） */
export interface WriterExportListItem {
  checked?: boolean
  nodes: WriterExportNode[]
}

/** 表格单元格 */
export interface WriterExportTableCell {
  header: boolean
  runs: WriterExportRun[]
}

/** 表格行 */
export interface WriterExportTableRow {
  cells: WriterExportTableCell[]
}

/** 脚注条目（编号按正文引用首次出现顺序） */
export interface WriterExportFootnote {
  number: number
  runs: WriterExportRun[]
}

/** 统一导出 AST 文档：Mapper 产出，各输出器只消费此结构 */
export interface WriterExportDocument {
  title: string
  nodes: WriterExportNode[]
  assets: Array<{ sourcePath: string; exportName: string }>
  warnings: string[]
}

/** 稳定导出节点判别联合 */
export type WriterExportNode =
  | { kind: 'paragraph'; runs: WriterExportRun[] }
  | { kind: 'heading'; level: number; runs: WriterExportRun[] }
  | { kind: 'blockquote'; children: WriterExportNode[] }
  | { kind: 'bulletList' | 'orderedList' | 'taskList'; items: WriterExportListItem[] }
  | { kind: 'code'; language?: string; text: string }
  | { kind: 'math'; display: boolean; latex: string }
  | { kind: 'image'; assetPath: string; alt: string; caption?: string; width: number }
  | { kind: 'table'; rows: WriterExportTableRow[] }
  | { kind: 'horizontalRule' }
  | { kind: 'footnotes'; items: WriterExportFootnote[] }

export type WriterAiScope = 'cursor' | 'selection' | 'section' | 'document'

export interface WriterAiAnchor {
  documentId: string
  baseRevision: number
  scope: WriterAiScope
  startBlockId: string
  endBlockId: string
  startOffset: number
  endOffset: number
  expectedTextHash: string
}

export interface WriterAiContextBlock {
  nodeId: string
  type: 'paragraph' | 'heading' | 'listItem' | 'blockquote' | 'codeBlock' | 'blockMath'
  text: string
  level?: number
}

export interface WriterAiRequestContext {
  documentId: string
  baseRevision: number
  title: string
  anchor: WriterAiAnchor
  blocks: WriterAiContextBlock[]
}

export type WriterEditOperationInput =
  | {
      kind: 'insert_text'
      blockId: string
      offset: number
      text: string
    }
  | {
      kind: 'replace_text'
      blockId: string
      from: number
      to: number
      text: string
    }
  | {
      kind: 'delete_text'
      blockId: string
      from: number
      to: number
    }
  | {
      kind: 'insert_blocks' | 'replace_blocks'
      afterBlockId?: string
      targetBlockIds?: string[]
      blocks: WriterAiContextBlock[]
    }

export type WriterEditOperation =
  | {
      kind: 'insert_text'
      blockId: string
      offset: number
      text: string
    }
  | {
      kind: 'replace_text'
      blockId: string
      from: number
      to: number
      text: string
      expectedTextHash: string
    }
  | {
      kind: 'delete_text'
      blockId: string
      from: number
      to: number
      expectedTextHash: string
    }
  | {
      kind: 'insert_blocks'
      afterBlockId?: string
      blocks: WriterAiContextBlock[]
    }
  | {
      kind: 'replace_blocks'
      targetBlockIds: string[]
      blocks: WriterAiContextBlock[]
      expectedBlockHashes: Record<string, string>
    }

export interface WriterAiProposal {
  proposalId: string
  documentId: string
  baseRevision: number
  anchor: WriterAiAnchor
  operations: WriterEditOperation[]
  createdAt: string
}
