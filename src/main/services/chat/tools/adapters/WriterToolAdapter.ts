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

const ALLOWED_BLOCK_TYPES = new Set<WriterAiContextBlock['type']>([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'codeBlock',
  'blockMath'
])

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
    const textRanges = new Map<string, Array<{ from: number; to: number }>>()
    const ops: WriterEditOperation[] = []

    for (const input of inputs) {
      switch (input.kind) {
        case 'insert_text': {
          this.assertInScope(input.blockId, blockMap)
          this.assertOffset(input.blockId, input.offset, blockMap)
          insertChars += input.text.length
          this.assertInsertBudget(insertChars)
          this.recordPoint(textRanges, input.blockId, input.offset)
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
          this.recordRange(textRanges, input.blockId, input.from, input.to)
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
          this.recordRange(textRanges, input.blockId, input.from, input.to)
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

  private recordPoint(
    ranges: Map<string, Array<{ from: number; to: number }>>,
    blockId: string,
    offset: number
  ): void {
    // 插入点与已有区间重叠判定：落入已占用区间则冲突
    const list = ranges.get(blockId) ?? []
    for (const r of list) {
      if (offset >= r.from && offset < r.to) {
        throw new Error(`块 ${blockId} 上的编辑操作发生重叠`)
      }
    }
    ranges.set(blockId, list)
  }

  private recordRange(
    ranges: Map<string, Array<{ from: number; to: number }>>,
    blockId: string,
    from: number,
    to: number
  ): void {
    const list = ranges.get(blockId) ?? []
    for (const r of list) {
      if (!(to <= r.from || from >= r.to)) {
        throw new Error(`块 ${blockId} 上的编辑操作发生重叠`)
      }
    }
    list.push({ from, to })
    ranges.set(blockId, list)
  }
}
