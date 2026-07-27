import { randomUUID } from 'crypto'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolResultMetadata } from '../PipelineTypes'
import type {
  WriterAiContextBlock,
  WriterAiProposal,
  WriterAiRequestContext,
  WriterEditOperation,
  WriterEditOperationInput
} from '@shared/types/writer'
import { writerProposeEditsArgsSchema } from '@shared/schemas/writerSchema'
import { hashWriterText } from '@shared/utils/writerText'

const MAX_INSERT_CHARS = 100_000

/** insert_blocks 未指定 afterBlockId 时占用的文档头插入槽哨兵 */
const INSERT_BLOCKS_DOC_START = '__writer_doc_start__'

/** insert_blocks 在 afterBlockId 之后的插入槽键（不占用该块正文） */
function insertionSlotKey(afterBlockId: string | undefined): string {
  return afterBlockId ? `__writer_insert_after:${afterBlockId}` : INSERT_BLOCKS_DOC_START
}

/** 去掉 insertion 与 context 后缀的最长重叠前缀（用于续写去重） */
function stripOverlappingPrefix(context: string, insertion: string): string {
  if (!context || !insertion) return insertion
  const max = Math.min(context.length, insertion.length)
  for (let len = max; len > 0; len--) {
    if (context.endsWith(insertion.slice(0, len))) {
      return insertion.slice(len)
    }
  }
  return insertion
}

/** 模型常把字符数算多：将半开区间钳到合法块内范围 */
function clampTextRange(from: number, to: number, length: number): { from: number; to: number } {
  const clampedFrom = Math.max(0, Math.min(from, length))
  const clampedTo = Math.max(clampedFrom, Math.min(to, length))
  return { from: clampedFrom, to: clampedTo }
}

const ALLOWED_BLOCK_TYPES = new Set<WriterAiContextBlock['type']>([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'codeBlock',
  'blockMath'
])

/**
 * 全局非重叠规则（适配器侧，依赖请求上下文）：
 * - 文本操作按块内半开区间互斥；insert_text 记为零宽点 [offset,offset]，
 *   同 offset 的多次 insert 冲突，且与覆盖该点的 replace/delete（from <= offset < to）冲突。
 * - replace_blocks 占用全部 targetBlockIds。
 * - insert_blocks 占用插入槽哨兵（`__writer_insert_after:<id>` 或文档头哨兵），
 *   不占用 afterBlockId 正文；同槽二次插入冲突，但与该块上的文本操作可共存。
 */
type TextRange = { from: number; to: number }

const PROPOSE_EDITS_TOOL: MCPToolReference = {
  serverName: 'writer',
  toolName: 'propose_edits',
  description:
    '对当前写作范围内的正文提出结构化编辑建议。只能返回建议，不会保存文档或修改标题。禁止创建/删除/移动图片或改变表格结构。',
  inputSchema: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        description: '结构化编辑操作列表（最多 100 条）',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: [
                'insert_text',
                'replace_text',
                'delete_text',
                'insert_blocks',
                'replace_blocks'
              ]
            },
            blockId: { type: 'string' },
            offset: { type: 'number' },
            from: { type: 'number' },
            to: { type: 'number' },
            text: { type: 'string' },
            afterBlockId: { type: 'string' },
            targetBlockIds: { type: 'array', items: { type: 'string' } },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  nodeId: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: [
                      'paragraph',
                      'heading',
                      'listItem',
                      'blockquote',
                      'codeBlock',
                      'blockMath'
                    ]
                  },
                  text: { type: 'string' },
                  level: { type: 'number' }
                },
                required: ['nodeId', 'type', 'text']
              }
            }
          },
          required: ['kind']
        }
      }
    },
    required: ['operations'],
    additionalProperties: false
  }
}

/**
 * 写作工具适配器
 * 仅产出结构化编辑建议（WriterAiProposal），绝不保存文档或修改标题
 */
export class WriterToolAdapter implements ToolAdapter {
  private readonly context: WriterAiRequestContext

  constructor(context: WriterAiRequestContext) {
    this.context = context
  }

  async getTools(): Promise<MCPToolReference[]> {
    return [PROPOSE_EDITS_TOOL]
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const normalized = toolName.startsWith('writer__')
      ? toolName.slice('writer__'.length)
      : toolName

    if (normalized !== 'propose_edits') {
      return { success: false, error: `未知的写作工具: ${toolName}，当前仅支持 propose_edits` }
    }

    // 拒绝任何标题修改企图
    if ('title' in args) {
      return { success: false, error: '禁止修改文档标题：标题为只读元数据' }
    }

    const parsed = writerProposeEditsArgsSchema.safeParse(args)
    if (!parsed.success) {
      return {
        success: false,
        error: `编辑建议参数无效: ${parsed.error.issues.map((i) => i.message).join('; ')}`
      }
    }

    try {
      const operations = this.buildOperations(parsed.data.operations)
      const proposal: WriterAiProposal = {
        proposalId: `proposal-${randomUUID()}`,
        documentId: this.context.documentId,
        baseRevision: this.context.baseRevision,
        anchor: this.context.anchor,
        operations,
        createdAt: new Date().toISOString()
      }
      return { success: true, content: proposal }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  }

  enrichResult(
    _toolName: string,
    _args: Record<string, unknown>,
    result: MCPToolCallResult
  ): ToolResultMetadata {
    return {
      coverage: result.success ? 'medium' : 'low',
      keyFindings: [],
      sourceType: 'writer',
      sourceName: this.context.documentId,
      confidence: result.success ? 0.8 : 0
    }
  }

  private buildOperations(inputs: WriterEditOperationInput[]): WriterEditOperation[] {
    const blockMap = new Map(this.context.blocks.map((b) => [b.nodeId, b]))
    let insertChars = 0
    const textRanges = new Map<string, TextRange[]>()
    const claimedBlocks = new Set<string>()
    const ops: WriterEditOperation[] = []

    for (const input of inputs) {
      switch (input.kind) {
        case 'insert_text': {
          this.assertInScope(input.blockId, blockMap)
          this.assertOffset(input.blockId, input.offset, blockMap)
          insertChars += input.text.length
          this.assertInsertBudget(insertChars)
          this.recordPoint(textRanges, claimedBlocks, input.blockId, input.offset)
          ops.push({
            kind: 'insert_text',
            blockId: input.blockId,
            offset: input.offset,
            text: input.text
          })
          break
        }
        case 'replace_text': {
          this.assertInScope(input.blockId, blockMap)
          const block = blockMap.get(input.blockId)!
          const { from, to } = clampTextRange(input.from, input.to, block.text.length)
          this.assertRange(input.blockId, from, to, blockMap)
          insertChars += input.text.length
          this.assertInsertBudget(insertChars)
          this.recordRange(textRanges, claimedBlocks, input.blockId, from, to)
          const slice = block.text.slice(from, to)
          ops.push({
            kind: 'replace_text',
            blockId: input.blockId,
            from,
            to,
            text: input.text,
            expectedTextHash: hashWriterText(slice)
          })
          break
        }
        case 'delete_text': {
          this.assertInScope(input.blockId, blockMap)
          const block = blockMap.get(input.blockId)!
          const { from, to } = clampTextRange(input.from, input.to, block.text.length)
          this.assertRange(input.blockId, from, to, blockMap)
          this.recordRange(textRanges, claimedBlocks, input.blockId, from, to)
          const slice = block.text.slice(from, to)
          ops.push({
            kind: 'delete_text',
            blockId: input.blockId,
            from,
            to,
            expectedTextHash: hashWriterText(slice)
          })
          break
        }
        case 'insert_blocks': {
          this.assertBlocksAllowed(input.blocks)
          if (input.afterBlockId) {
            this.assertInScope(input.afterBlockId, blockMap)
          }
          insertChars += input.blocks.reduce((sum, b) => sum + b.text.length, 0)
          this.assertInsertBudget(insertChars)
          // 插入槽哨兵：不占用 afterBlockId 正文，仅同槽二次插入冲突
          this.claimWholeBlock(claimedBlocks, textRanges, insertionSlotKey(input.afterBlockId))
          ops.push({
            kind: 'insert_blocks',
            afterBlockId: input.afterBlockId,
            blocks: input.blocks
          })
          break
        }
        case 'replace_blocks': {
          const targetBlockIds = input.targetBlockIds
          if (!targetBlockIds || targetBlockIds.length === 0) {
            throw new Error('replace_blocks 必须提供 targetBlockIds')
          }
          for (const id of targetBlockIds) {
            this.assertInScope(id, blockMap)
          }
          this.assertBlocksAllowed(input.blocks)
          insertChars += input.blocks.reduce((sum, b) => sum + b.text.length, 0)
          this.assertInsertBudget(insertChars)
          for (const id of targetBlockIds) {
            this.claimWholeBlock(claimedBlocks, textRanges, id)
          }
          const expectedBlockHashes: Record<string, string> = {}
          for (const id of targetBlockIds) {
            expectedBlockHashes[id] = hashWriterText(blockMap.get(id)!.text)
          }
          ops.push({
            kind: 'replace_blocks',
            targetBlockIds,
            blocks: input.blocks,
            expectedBlockHashes
          })
          break
        }
        default: {
          const kind = (input as { kind: string }).kind
          throw new Error(`不支持的编辑操作: ${kind}`)
        }
      }
    }

    return this.normalizeSelectionOperations(ops, blockMap)
  }

  /**
   * 修正 selection 范围上模型常见的偏移错误：
   * 1) 相对选区的 from/to（从 0 起算）→ 映射为块内绝对偏移
   * 2) 不完整 replace → 扩展到整段选区，避免尾部原文残留重叠
   * 3) 续写 insert 与选区尾部前缀重叠 → 剥掉重叠前缀
   */
  private normalizeSelectionOperations(
    ops: WriterEditOperation[],
    blockMap: Map<string, WriterAiContextBlock>
  ): WriterEditOperation[] {
    const { anchor } = this.context
    if (anchor.scope !== 'selection') return ops

    let next = ops

    if (anchor.startBlockId === anchor.endBlockId) {
      const blockId = anchor.startBlockId
      const block = blockMap.get(blockId)
      const selFrom = anchor.startOffset
      const selTo = anchor.endOffset
      if (block && selFrom < selTo) {
        const selLen = selTo - selFrom
        const textMutations = next.filter(
          (op) =>
            (op.kind === 'replace_text' || op.kind === 'delete_text') && op.blockId === blockId
        )
        const replaces = next.filter(
          (op): op is Extract<WriterEditOperation, { kind: 'replace_text' }> =>
            op.kind === 'replace_text' && op.blockId === blockId
        )

        if (replaces.length === 1 && textMutations.length === 1) {
          const op = replaces[0]!
          let from = op.from
          let to = op.to

          // 模型把选区当作 [0, selLen) 时，映射到块内绝对偏移
          if (selFrom > 0 && from === 0 && to === selLen) {
            from = selFrom
            to = selTo
          }

          // 不完整覆盖：扩展到整段选区（保留模型给出的替换文本）
          if (from >= selFrom && to <= selTo && (from > selFrom || to < selTo)) {
            from = selFrom
            to = selTo
          }

          if (from !== op.from || to !== op.to) {
            const slice = block.text.slice(from, to)
            next = next.map((item) =>
              item === op
                ? {
                    ...op,
                    from,
                    to,
                    expectedTextHash: hashWriterText(slice)
                  }
                : item
            )
          }
        }
      }
    }

    return this.stripContinuationOverlap(next, blockMap)
  }

  /** 续写 insert 常重复选区尾部；剥掉与选区后缀的最长公共前缀 */
  private stripContinuationOverlap(
    ops: WriterEditOperation[],
    blockMap: Map<string, WriterAiContextBlock>
  ): WriterEditOperation[] {
    const { anchor } = this.context
    const result: WriterEditOperation[] = []

    for (const op of ops) {
      if (op.kind !== 'insert_text' || op.blockId !== anchor.endBlockId) {
        result.push(op)
        continue
      }
      if (op.offset !== anchor.endOffset) {
        result.push(op)
        continue
      }

      const block = blockMap.get(op.blockId)
      if (!block) {
        result.push(op)
        continue
      }

      const selectedSuffix =
        anchor.startBlockId === anchor.endBlockId
          ? block.text.slice(anchor.startOffset, anchor.endOffset)
          : block.text.slice(0, anchor.endOffset)
      const stripped = stripOverlappingPrefix(selectedSuffix, op.text)
      if (stripped.length === 0) continue
      if (stripped === op.text) {
        result.push(op)
        continue
      }
      result.push({ ...op, text: stripped })
    }

    return result
  }

  private assertInScope(blockId: string, blockMap: Map<string, WriterAiContextBlock>): void {
    if (!blockMap.has(blockId)) {
      throw new Error(`块 ${blockId} 不在当前编辑范围内`)
    }
  }

  private assertOffset(
    blockId: string,
    offset: number,
    blockMap: Map<string, WriterAiContextBlock>
  ): void {
    const block = blockMap.get(blockId)!
    if (offset < 0 || offset > block.text.length) {
      throw new Error(`块 ${blockId} 的 offset ${offset} 越界`)
    }
  }

  private assertRange(
    blockId: string,
    from: number,
    to: number,
    blockMap: Map<string, WriterAiContextBlock>
  ): void {
    const block = blockMap.get(blockId)!
    if (from < 0 || to < from || to > block.text.length) {
      throw new Error(`块 ${blockId} 的范围 [${from}, ${to}) 无效`)
    }
  }

  private assertBlocksAllowed(blocks: WriterAiContextBlock[]): void {
    for (const block of blocks) {
      if (!ALLOWED_BLOCK_TYPES.has(block.type)) {
        throw new Error(`不允许的块类型: ${block.type}（禁止图片/表格结构变化）`)
      }
    }
  }

  private assertInsertBudget(total: number): void {
    if (total > MAX_INSERT_CHARS) {
      throw new Error(`插入文本总计超过 ${MAX_INSERT_CHARS} 字符上限`)
    }
  }

  private rangesOverlap(a: TextRange, b: TextRange): boolean {
    const aPoint = a.from === a.to
    const bPoint = b.from === b.to
    if (aPoint && bPoint) {
      return a.from === b.from
    }
    if (aPoint) {
      return a.from >= b.from && a.from < b.to
    }
    if (bPoint) {
      return b.from >= a.from && b.from < a.to
    }
    return !(a.to <= b.from || a.from >= b.to)
  }

  private recordPoint(
    ranges: Map<string, TextRange[]>,
    claimedBlocks: Set<string>,
    blockId: string,
    offset: number
  ): void {
    this.recordRange(ranges, claimedBlocks, blockId, offset, offset)
  }

  private recordRange(
    ranges: Map<string, TextRange[]>,
    claimedBlocks: Set<string>,
    blockId: string,
    from: number,
    to: number
  ): void {
    if (claimedBlocks.has(blockId)) {
      throw new Error(`块 ${blockId} 上的编辑操作发生重叠`)
    }
    const next: TextRange = { from, to }
    const list = ranges.get(blockId) ?? []
    for (const r of list) {
      if (this.rangesOverlap(next, r)) {
        throw new Error(`块 ${blockId} 上的编辑操作发生重叠`)
      }
    }
    list.push(next)
    ranges.set(blockId, list)
  }

  private claimWholeBlock(
    claimedBlocks: Set<string>,
    ranges: Map<string, TextRange[]>,
    blockId: string
  ): void {
    if (claimedBlocks.has(blockId)) {
      throw new Error(`块 ${blockId} 上的编辑操作发生重叠`)
    }
    const list = ranges.get(blockId)
    if (list && list.length > 0) {
      throw new Error(`块 ${blockId} 上的编辑操作发生重叠`)
    }
    claimedBlocks.add(blockId)
  }
}
