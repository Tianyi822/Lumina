import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type {
  WriterAiAnchor,
  WriterAiContextBlock,
  WriterAiProposal,
  WriterAiRequestContext,
  WriterAiScope,
  WriterEditOperation
} from '@shared/types/writer'
import { hashWriterText } from '@shared/utils/writerText'
import { useWriterSessionStore } from '@renderer/stores/writer/writerSessionStore'

const ALLOWED_BLOCK_TYPES = new Set<WriterAiContextBlock['type']>([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'codeBlock',
  'blockMath'
])

/** insert_blocks 未指定 afterBlockId 时占用的文档头插入槽哨兵 */
const INSERT_BLOCKS_DOC_START = '__writer_doc_start__'

/** insert_blocks 在 afterBlockId 之后的插入槽键（不占用该块正文） */
function insertionSlotKey(afterBlockId: string | undefined): string {
  return afterBlockId ? `__writer_insert_after:${afterBlockId}` : INSERT_BLOCKS_DOC_START
}

const CONTEXT_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'codeBlock',
  'blockMath'
])

export type ProposalInvalidReason =
  | 'target_changed'
  | 'invalid_structure'
  | 'document_mismatch'
  | 'session_stale'
  | 'overlap'
  | 'schema_rejected'

export type ProposalValidationResult =
  | { valid: true }
  | { valid: false; reason: ProposalInvalidReason }

type TextRange = { from: number; to: number }

interface LocatedBlock {
  node: ProseMirrorNode
  pos: number
  textStart: number
  text: string
  type: WriterAiContextBlock['type']
}

/** 当前写作编辑器注册表，供聊天流构造 writerContext */
let registeredWriterEditor: Editor | null = null

export function registerWriterEditor(editor: Editor | null): void {
  registeredWriterEditor = editor
}

export function getRegisteredWriterEditor(): Editor | null {
  return registeredWriterEditor
}

/**
 * 从编辑器当前状态构造 AI 请求上下文。
 * documentId / title 取自写作会话 store（与打开文档对齐）。
 */
export function createWriterAiRequestContext(
  editor: Editor,
  scope: WriterAiScope,
  revision: number
): WriterAiRequestContext | null {
  const session = useWriterSessionStore.getState()
  const documentId = session.currentDocumentId
  if (!documentId) return null

  const blocks = collectContextBlocks(editor.state, scope)
  if (blocks.length === 0) return null

  const joined = blocks.map((block) => block.text).join('\n')
  const first = blocks[0]!
  const last = blocks[blocks.length - 1]!
  const { startOffset, endOffset } = resolveAnchorOffsets(editor.state, scope, blocks)
  const anchor: WriterAiAnchor = {
    documentId,
    baseRevision: revision,
    scope,
    startBlockId: first.nodeId,
    endBlockId: last.nodeId,
    startOffset,
    // 多块范围时 endOffset 相对 endBlock（末块），不是首块
    endOffset,
    expectedTextHash: hashWriterText(joined)
  }

  return {
    documentId,
    baseRevision: revision,
    title: session.titleSummary || '无标题文档',
    anchor,
    blocks
  }
}

export interface BoundedWriterAiContextResult {
  context: WriterAiRequestContext
  truncated: boolean
  originalBlockCount: number
}

export interface BuildBoundedWriterAiContextOptions {
  /** 字符预算；缺省使用主进程同源常量量级 24000 */
  charBudget?: number
}

/**
 * 在请求构造阶段按 heading 分组截断超长上下文，避免直接超预算失败。
 * 截断后重建锚点与 expectedTextHash；未超限时原样返回。
 */
export function buildBoundedWriterAiContext(
  context: WriterAiRequestContext,
  options: BuildBoundedWriterAiContextOptions = {}
): BoundedWriterAiContextResult {
  const charBudget = options.charBudget ?? 24_000
  const originalBlockCount = context.blocks.length
  if (estimateContextChars(context) <= charBudget) {
    return { context, truncated: false, originalBlockCount }
  }

  const sections = groupBlocksByHeading(context.blocks)
  const kept: WriterAiContextBlock[] = []
  for (const section of sections) {
    const candidate = [...kept, ...section]
    const nextContext = rebuildContextWithBlocks(context, candidate)
    if (estimateContextChars(nextContext) > charBudget && kept.length > 0) {
      break
    }
    kept.push(...section)
    if (estimateContextChars(rebuildContextWithBlocks(context, kept)) > charBudget) {
      // 单节过大时按块回退
      kept.length = kept.length - section.length
      for (const block of section) {
        const withBlock = [...kept, block]
        if (
          estimateContextChars(rebuildContextWithBlocks(context, withBlock)) > charBudget &&
          kept.length > 0
        ) {
          break
        }
        kept.push(block)
      }
      break
    }
  }

  const truncatedBlocks = kept.length > 0 ? kept : context.blocks.slice(0, 1)
  return {
    context: rebuildContextWithBlocks(context, truncatedBlocks),
    truncated: truncatedBlocks.length < originalBlockCount,
    originalBlockCount
  }
}

function estimateContextChars(context: WriterAiRequestContext): number {
  // 与 WriterContextFormatter 同量级：标题元数据 + 块文本
  const meta = context.title.length + context.documentId.length + 400
  const body = context.blocks.reduce(
    (sum, block) => sum + block.text.length + block.nodeId.length + 16,
    0
  )
  return meta + body
}

function groupBlocksByHeading(blocks: WriterAiContextBlock[]): WriterAiContextBlock[][] {
  const sections: WriterAiContextBlock[][] = []
  let current: WriterAiContextBlock[] = []
  for (const block of blocks) {
    if (block.type === 'heading' && current.length > 0) {
      sections.push(current)
      current = [block]
    } else {
      current.push(block)
    }
  }
  if (current.length > 0) sections.push(current)
  return sections
}

function rebuildContextWithBlocks(
  context: WriterAiRequestContext,
  blocks: WriterAiContextBlock[]
): WriterAiRequestContext {
  const first = blocks[0]!
  const last = blocks[blocks.length - 1]!
  const joined = blocks.map((block) => block.text).join('\n')
  return {
    ...context,
    blocks,
    anchor: {
      ...context.anchor,
      startBlockId: first.nodeId,
      endBlockId: last.nodeId,
      startOffset: 0,
      endOffset: last.text.length,
      expectedTextHash: hashWriterText(joined)
    }
  }
}

/** 对当前 EditorState 双重校验整组建议；任一失败则整组拒绝 */
export function validateProposalAgainstState(
  proposal: WriterAiProposal,
  state: EditorState,
  options?: { documentId?: string | null; baseRevision?: number | null; sessionStale?: boolean }
): ProposalValidationResult {
  if (options?.sessionStale) {
    return { valid: false, reason: 'session_stale' }
  }
  if (options?.documentId && options.documentId !== proposal.documentId) {
    return { valid: false, reason: 'document_mismatch' }
  }

  const blockMap = collectBlockMap(state)
  const textRanges = new Map<string, TextRange[]>()
  const claimedBlocks = new Set<string>()

  for (const op of proposal.operations) {
    const opResult = validateOperation(op, state, blockMap, textRanges, claimedBlocks)
    if (!opResult.valid) return opResult
  }

  return { valid: true }
}

/**
 * 将已接受操作合并为单个 Transaction（调用方再 setMeta 并一次 dispatch）。
 * 按文档位置从后往前应用，避免偏移错位。
 */
export function applyAcceptedOperations(
  state: EditorState,
  operations: WriterEditOperation[]
): Transaction {
  const prepared = operations
    .map((op, index) => ({ op, index, abs: absoluteRangeForOperation(state, op) }))
    .filter((item) => item.abs !== null) as Array<{
    op: WriterEditOperation
    index: number
    abs: { from: number; to: number; insertPos?: number; afterPos?: number }
  }>

  prepared.sort((a, b) => b.abs.from - a.abs.from || b.index - a.index)

  let tr = state.tr
  for (const item of prepared) {
    tr = applyOneOperation(tr, state.schema, item.op, item.abs)
  }
  return tr
}

export function findBlockByNodeId(state: EditorState, nodeId: string): LocatedBlock | null {
  let found: LocatedBlock | null = null
  state.doc.descendants((node, pos) => {
    if (found) return false
    const id = node.attrs?.nodeId
    if (typeof id === 'string' && id === nodeId) {
      const mappedType = mapNodeType(node)
      if (!mappedType) return true
      found = {
        node,
        pos,
        textStart: pos + 1,
        text: node.textContent,
        type: mappedType
      }
      return false
    }
    return true
  })
  return found
}

function omitBlockPos(block: WriterAiContextBlock & { pos: number }): WriterAiContextBlock {
  return {
    nodeId: block.nodeId,
    type: block.type,
    text: block.text,
    level: block.level
  }
}

/**
 * 解析锚点在首/末块内的字符偏移。
 * selection：精确到选区；cursor：光标处；其余范围覆盖整块。
 */
function resolveAnchorOffsets(
  state: EditorState,
  scope: WriterAiScope,
  blocks: WriterAiContextBlock[]
): { startOffset: number; endOffset: number } {
  const first = blocks[0]!
  const last = blocks[blocks.length - 1]!

  if (scope === 'selection') {
    const selFrom = Math.min(state.selection.from, state.selection.to)
    const selTo = Math.max(state.selection.from, state.selection.to)
    const firstLoc = findBlockByNodeId(state, first.nodeId)
    const lastLoc = findBlockByNodeId(state, last.nodeId)
    if (!firstLoc || !lastLoc) {
      return { startOffset: 0, endOffset: last.text.length }
    }
    return {
      startOffset: clampOffset(selFrom - firstLoc.textStart, first.text.length),
      endOffset: clampOffset(selTo - lastLoc.textStart, last.text.length)
    }
  }

  if (scope === 'cursor') {
    const loc = findBlockByNodeId(state, first.nodeId)
    if (!loc) {
      return { startOffset: 0, endOffset: 0 }
    }
    const offset = clampOffset(state.selection.head - loc.textStart, first.text.length)
    return { startOffset: offset, endOffset: offset }
  }

  return { startOffset: 0, endOffset: last.text.length }
}

function clampOffset(value: number, max: number): number {
  if (value < 0) return 0
  if (value > max) return max
  return value
}

function collectContextBlocks(state: EditorState, scope: WriterAiScope): WriterAiContextBlock[] {
  const all: Array<WriterAiContextBlock & { pos: number }> = []
  state.doc.descendants((node, pos) => {
    const mapped = mapNodeType(node)
    const nodeId = node.attrs?.nodeId
    if (!mapped || typeof nodeId !== 'string' || !nodeId) return true
    if (!CONTEXT_NODE_TYPES.has(node.type.name) && mapped !== 'listItem') {
      // blockquote / listItem 等按自身类型收录
    }
    all.push({
      nodeId,
      type: mapped,
      text: node.textContent,
      level: node.type.name === 'heading' ? Number(node.attrs.level ?? 1) : undefined,
      pos
    })
    return true
  })

  if (scope === 'document') {
    return all.map((block) => omitBlockPos(block))
  }

  const { from, to } = state.selection
  if (scope === 'cursor' || scope === 'selection') {
    const start = scope === 'cursor' ? state.selection.head : Math.min(from, to)
    const end = scope === 'cursor' ? state.selection.head : Math.max(from, to)
    return all
      .filter((block) => {
        const blockEnd = block.pos + (findBlockByNodeId(state, block.nodeId)?.node.nodeSize ?? 0)
        return block.pos < end && blockEnd > start
      })
      .map((block) => omitBlockPos(block))
  }

  // section：从光标所在标题到下一同级/更高级标题
  const head = state.selection.head
  let currentHeadingLevel: number | null = null
  let sectionStartPos = 0
  for (const block of all) {
    if (block.type === 'heading' && block.pos <= head) {
      currentHeadingLevel = block.level ?? 1
      sectionStartPos = block.pos
    }
  }
  if (currentHeadingLevel === null) {
    return all.map((block) => omitBlockPos(block))
  }

  const section: WriterAiContextBlock[] = []
  for (const block of all) {
    if (block.pos < sectionStartPos) continue
    if (
      block.pos > sectionStartPos &&
      block.type === 'heading' &&
      (block.level ?? 1) <= currentHeadingLevel
    ) {
      break
    }
    section.push({
      nodeId: block.nodeId,
      type: block.type,
      text: block.text,
      level: block.level
    })
  }
  return section
}

function collectBlockMap(state: EditorState): Map<string, LocatedBlock> {
  const map = new Map<string, LocatedBlock>()
  state.doc.descendants((node, pos) => {
    const nodeId = node.attrs?.nodeId
    const mapped = mapNodeType(node)
    if (typeof nodeId === 'string' && nodeId && mapped) {
      map.set(nodeId, {
        node,
        pos,
        textStart: pos + 1,
        text: node.textContent,
        type: mapped
      })
    }
    return true
  })
  return map
}

function mapNodeType(node: ProseMirrorNode): WriterAiContextBlock['type'] | null {
  switch (node.type.name) {
    case 'paragraph':
      return 'paragraph'
    case 'heading':
      return 'heading'
    case 'listItem':
      return 'listItem'
    case 'blockquote':
      return 'blockquote'
    case 'codeBlock':
      return 'codeBlock'
    case 'blockMath':
      return 'blockMath'
    default:
      return null
  }
}

function validateOperation(
  op: WriterEditOperation,
  state: EditorState,
  blockMap: Map<string, LocatedBlock>,
  textRanges: Map<string, TextRange[]>,
  claimedBlocks: Set<string>
): ProposalValidationResult {
  switch (op.kind) {
    case 'insert_text': {
      const block = blockMap.get(op.blockId)
      if (!block) return { valid: false, reason: 'invalid_structure' }
      if (op.offset < 0 || op.offset > block.text.length) {
        return { valid: false, reason: 'invalid_structure' }
      }
      if (!recordRange(textRanges, claimedBlocks, op.blockId, op.offset, op.offset)) {
        return { valid: false, reason: 'overlap' }
      }
      if (!canInsertText(state, block, op.offset, op.text)) {
        return { valid: false, reason: 'schema_rejected' }
      }
      return { valid: true }
    }
    case 'replace_text': {
      const block = blockMap.get(op.blockId)
      if (!block) return { valid: false, reason: 'invalid_structure' }
      if (op.from < 0 || op.to < op.from || op.to > block.text.length) {
        return { valid: false, reason: 'invalid_structure' }
      }
      const slice = block.text.slice(op.from, op.to)
      if (hashWriterText(slice) !== op.expectedTextHash) {
        return { valid: false, reason: 'target_changed' }
      }
      if (!recordRange(textRanges, claimedBlocks, op.blockId, op.from, op.to)) {
        return { valid: false, reason: 'overlap' }
      }
      if (!canReplaceText(state, block, op.from, op.to, op.text)) {
        return { valid: false, reason: 'schema_rejected' }
      }
      return { valid: true }
    }
    case 'delete_text': {
      const block = blockMap.get(op.blockId)
      if (!block) return { valid: false, reason: 'invalid_structure' }
      if (op.from < 0 || op.to < op.from || op.to > block.text.length) {
        return { valid: false, reason: 'invalid_structure' }
      }
      const slice = block.text.slice(op.from, op.to)
      if (hashWriterText(slice) !== op.expectedTextHash) {
        return { valid: false, reason: 'target_changed' }
      }
      if (!recordRange(textRanges, claimedBlocks, op.blockId, op.from, op.to)) {
        return { valid: false, reason: 'overlap' }
      }
      return { valid: true }
    }
    case 'insert_blocks': {
      if (op.afterBlockId && !blockMap.has(op.afterBlockId)) {
        return { valid: false, reason: 'invalid_structure' }
      }
      for (const block of op.blocks) {
        if (!ALLOWED_BLOCK_TYPES.has(block.type)) {
          return { valid: false, reason: 'invalid_structure' }
        }
      }
      // 插入槽哨兵：与 afterBlockId 正文上的文本操作可共存；同槽二次插入仍冲突
      if (!claimWholeBlock(claimedBlocks, textRanges, insertionSlotKey(op.afterBlockId))) {
        return { valid: false, reason: 'overlap' }
      }
      if (!canCreateBlocks(state, op.blocks)) {
        return { valid: false, reason: 'schema_rejected' }
      }
      return { valid: true }
    }
    case 'replace_blocks': {
      for (const id of op.targetBlockIds) {
        const block = blockMap.get(id)
        if (!block) return { valid: false, reason: 'invalid_structure' }
        const expected = op.expectedBlockHashes[id]
        if (!expected || hashWriterText(block.text) !== expected) {
          return { valid: false, reason: 'target_changed' }
        }
        if (!claimWholeBlock(claimedBlocks, textRanges, id)) {
          return { valid: false, reason: 'overlap' }
        }
      }
      for (const block of op.blocks) {
        if (!ALLOWED_BLOCK_TYPES.has(block.type)) {
          return { valid: false, reason: 'invalid_structure' }
        }
      }
      if (!canCreateBlocks(state, op.blocks)) {
        return { valid: false, reason: 'schema_rejected' }
      }
      return { valid: true }
    }
    default:
      return { valid: false, reason: 'invalid_structure' }
  }
}

function rangesOverlap(a: TextRange, b: TextRange): boolean {
  const aPoint = a.from === a.to
  const bPoint = b.from === b.to
  if (aPoint && bPoint) return a.from === b.from
  if (aPoint) return a.from >= b.from && a.from < b.to
  if (bPoint) return b.from >= a.from && b.from < a.to
  return !(a.to <= b.from || a.from >= b.to)
}

function recordRange(
  ranges: Map<string, TextRange[]>,
  claimedBlocks: Set<string>,
  blockId: string,
  from: number,
  to: number
): boolean {
  if (claimedBlocks.has(blockId)) return false
  const next: TextRange = { from, to }
  const list = ranges.get(blockId) ?? []
  for (const existing of list) {
    if (rangesOverlap(next, existing)) return false
  }
  list.push(next)
  ranges.set(blockId, list)
  return true
}

function claimWholeBlock(
  claimedBlocks: Set<string>,
  ranges: Map<string, TextRange[]>,
  blockId: string
): boolean {
  if (claimedBlocks.has(blockId)) return false
  const list = ranges.get(blockId)
  if (list && list.length > 0) return false
  claimedBlocks.add(blockId)
  return true
}

function canInsertText(
  state: EditorState,
  block: LocatedBlock,
  offset: number,
  text: string
): boolean {
  try {
    const tr = state.tr.insertText(text, block.textStart + offset)
    tr.doc.check()
    return true
  } catch {
    return false
  }
}

function canReplaceText(
  state: EditorState,
  block: LocatedBlock,
  from: number,
  to: number,
  text: string
): boolean {
  try {
    const tr = state.tr.insertText(text, block.textStart + from, block.textStart + to)
    tr.doc.check()
    return true
  } catch {
    return false
  }
}

function canCreateBlocks(state: EditorState, blocks: WriterAiContextBlock[]): boolean {
  try {
    for (const block of blocks) {
      const json = contextBlockToJson(block)
      state.schema.nodeFromJSON(json).check()
    }
    return true
  } catch {
    return false
  }
}

function contextBlockToJson(block: WriterAiContextBlock): Record<string, unknown> {
  const textContent = block.text ? [{ type: 'text', text: block.text }] : undefined
  switch (block.type) {
    case 'heading':
      return {
        type: 'heading',
        attrs: { level: block.level ?? 1, nodeId: block.nodeId },
        content: textContent
      }
    case 'codeBlock':
      return {
        type: 'codeBlock',
        attrs: { language: null, nodeId: block.nodeId },
        content: textContent
      }
    case 'blockMath':
      return {
        type: 'blockMath',
        attrs: { latex: block.text, nodeId: block.nodeId }
      }
    case 'blockquote':
      return {
        type: 'blockquote',
        attrs: { nodeId: block.nodeId },
        content: [
          {
            type: 'paragraph',
            content: textContent
          }
        ]
      }
    case 'listItem':
      return {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            attrs: { nodeId: block.nodeId },
            content: [{ type: 'paragraph', content: textContent }]
          }
        ]
      }
    case 'paragraph':
    default:
      return {
        type: 'paragraph',
        attrs: { nodeId: block.nodeId },
        content: textContent
      }
  }
}

function absoluteRangeForOperation(
  state: EditorState,
  op: WriterEditOperation
): { from: number; to: number; insertPos?: number; afterPos?: number } | null {
  switch (op.kind) {
    case 'insert_text': {
      const block = findBlockByNodeId(state, op.blockId)
      if (!block) return null
      const pos = block.textStart + op.offset
      return { from: pos, to: pos, insertPos: pos }
    }
    case 'replace_text':
    case 'delete_text': {
      const block = findBlockByNodeId(state, op.blockId)
      if (!block) return null
      return { from: block.textStart + op.from, to: block.textStart + op.to }
    }
    case 'insert_blocks': {
      if (!op.afterBlockId) {
        return { from: 1, to: 1, afterPos: 0 }
      }
      const block = findBlockByNodeId(state, op.afterBlockId)
      if (!block) return null
      const after = block.pos + block.node.nodeSize
      return { from: after, to: after, afterPos: after }
    }
    case 'replace_blocks': {
      const targets = op.targetBlockIds
        .map((id) => findBlockByNodeId(state, id))
        .filter((item): item is LocatedBlock => item !== null)
      if (targets.length === 0) return null
      const from = Math.min(...targets.map((t) => t.pos))
      const to = Math.max(...targets.map((t) => t.pos + t.node.nodeSize))
      return { from, to }
    }
    default:
      return null
  }
}

function applyOneOperation(
  tr: Transaction,
  schema: EditorState['schema'],
  op: WriterEditOperation,
  abs: { from: number; to: number; insertPos?: number; afterPos?: number }
): Transaction {
  // 映射到当前 tr.doc 坐标
  const from = tr.mapping.map(abs.from)
  const to = tr.mapping.map(abs.to)

  switch (op.kind) {
    case 'insert_text':
      return tr.insertText(op.text, from)
    case 'replace_text':
      return tr.insertText(op.text, from, to)
    case 'delete_text':
      return tr.delete(from, to)
    case 'insert_blocks': {
      const nodes = op.blocks.map((block) => schema.nodeFromJSON(contextBlockToJson(block)))
      const insertPos =
        abs.afterPos !== undefined ? tr.mapping.map(abs.afterPos === 0 ? 1 : abs.afterPos) : from
      let next = tr
      let cursor = insertPos
      for (const node of nodes) {
        next = next.insert(cursor, node)
        cursor += node.nodeSize
      }
      return next
    }
    case 'replace_blocks': {
      const nodes = op.blocks.map((block) => schema.nodeFromJSON(contextBlockToJson(block)))
      let next = tr.delete(from, to)
      let cursor = from
      for (const node of nodes) {
        next = next.insert(cursor, node)
        cursor += node.nodeSize
      }
      return next
    }
    default:
      return tr
  }
}
