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
          this.assertRange(input.blockId, input.from, input.to, blockMap)
          insertChars += input.text.length
          this.assertInsertBudget(insertChars)
          this.recordRange(textRanges, claimedBlocks, input.blockId, input.from, input.to)
          const slice = blockMap.get(input.blockId)!.text.slice(input.from, input.to)
          ops.push({
            kind: 'replace_text',
            blockId: input.blockId,
            from: input.from,
            to: input.to,
            text: input.text,
            expectedTextHash: hashWriterText(slice)
          })
          break
        }
        case 'delete_text': {
          this.assertInScope(input.blockId, blockMap)
          this.assertRange(input.blockId, input.from, input.to, blockMap)
          this.recordRange(textRanges, claimedBlocks, input.blockId, input.from, input.to)
          const slice = blockMap.get(input.blockId)!.text.slice(input.from, input.to)
          ops.push({
            kind: 'delete_text',
            blockId: input.blockId,
            from: input.from,
            to: input.to,
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

    return ops
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
