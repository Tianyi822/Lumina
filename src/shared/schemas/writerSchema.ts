import { z } from 'zod'
import type {
  SaveWriterDocumentRequest,
  WriterAiAnchor,
  WriterAiContextBlock,
  WriterAiProposal,
  WriterAiRequestContext,
  WriterDocument,
  WriterEditOperation,
  WriterEditOperationInput,
  WriterJsonDocument,
  WriterJsonMark,
  WriterJsonNode
} from '../types/writer'

const writerIdSchema = z.string().regex(/^writer-[a-z0-9-]{8,}$/)
const writerTitleSchema = z.string().max(200)
const writerAttributesSchema = z.record(z.string(), z.unknown())

const writerJsonMarkSchema: z.ZodType<WriterJsonMark> = z.object({
  type: z.string(),
  attrs: writerAttributesSchema.optional()
})

const writerJsonNodeSchema: z.ZodType<WriterJsonNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: writerAttributesSchema.optional(),
    content: z.array(writerJsonNodeSchema).optional(),
    marks: z.array(writerJsonMarkSchema).optional(),
    text: z.string().optional()
  })
)

const writerJsonDocumentSchema: z.ZodType<WriterJsonDocument> = z.object({
  type: z.literal('doc'),
  attrs: writerAttributesSchema.optional(),
  content: z.array(writerJsonNodeSchema).optional(),
  marks: z.array(writerJsonMarkSchema).optional(),
  text: z.string().optional()
})

export const writerDocumentSchema: z.ZodType<WriterDocument> = z.object({
  schemaVersion: z.number().int(),
  id: writerIdSchema,
  revision: z.number().int().nonnegative(),
  title: writerTitleSchema,
  content: writerJsonDocumentSchema,
  folderId: z.string().optional(),
  favorite: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const saveWriterDocumentRequestSchema: z.ZodType<SaveWriterDocumentRequest> = z.object({
  documentId: writerIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  title: writerTitleSchema,
  content: writerJsonDocumentSchema
})

const writerAiScopeSchema = z.enum(['cursor', 'selection', 'section', 'document'])

const writerAiContextBlockTypeSchema = z.enum([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'codeBlock',
  'blockMath'
])

export const writerAiContextBlockSchema: z.ZodType<WriterAiContextBlock> = z.object({
  nodeId: z.string().min(1),
  type: writerAiContextBlockTypeSchema,
  text: z.string(),
  level: z.number().int().min(1).max(6).optional()
})

export const writerAiAnchorSchema: z.ZodType<WriterAiAnchor> = z.object({
  documentId: writerIdSchema,
  baseRevision: z.number().int().nonnegative(),
  scope: writerAiScopeSchema,
  startBlockId: z.string().min(1),
  endBlockId: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  expectedTextHash: z.string().min(1)
})

export const writerAiRequestContextSchema: z.ZodType<WriterAiRequestContext> = z.object({
  documentId: writerIdSchema,
  baseRevision: z.number().int().nonnegative(),
  title: writerTitleSchema,
  anchor: writerAiAnchorSchema,
  blocks: z.array(writerAiContextBlockSchema).min(1)
})

const writerInsertTextInputSchema = z.object({
  kind: z.literal('insert_text'),
  blockId: z.string().min(1),
  offset: z.number().int().nonnegative(),
  text: z.string()
})

const writerReplaceTextInputSchema = z.object({
  kind: z.literal('replace_text'),
  blockId: z.string().min(1),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  text: z.string()
})

const writerDeleteTextInputSchema = z.object({
  kind: z.literal('delete_text'),
  blockId: z.string().min(1),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative()
})

const writerBlockOpsInputSchema = z.object({
  kind: z.enum(['insert_blocks', 'replace_blocks']),
  afterBlockId: z.string().min(1).optional(),
  targetBlockIds: z.array(z.string().min(1)).optional(),
  blocks: z.array(writerAiContextBlockSchema).min(1)
})

export const writerEditOperationInputSchema: z.ZodType<WriterEditOperationInput> =
  z.discriminatedUnion('kind', [
    writerInsertTextInputSchema,
    writerReplaceTextInputSchema,
    writerDeleteTextInputSchema,
    writerBlockOpsInputSchema
  ])

const MAX_PROPOSE_INSERT_CHARS = 100_000

function countProposeInsertChars(operations: WriterEditOperationInput[]): number {
  let total = 0
  for (const op of operations) {
    if (op.kind === 'insert_text' || op.kind === 'replace_text') {
      total += op.text.length
    } else if (op.kind === 'insert_blocks' || op.kind === 'replace_blocks') {
      total += op.blocks.reduce((sum, block) => sum + block.text.length, 0)
    }
  }
  return total
}

export const writerProposeEditsArgsSchema = z
  .object({
    operations: z.array(writerEditOperationInputSchema).min(1).max(100)
  })
  .strict()
  .superRefine((data, ctx) => {
    // 插入文本总计上限（含 replace/insert_blocks 的新文本）；范围/重叠依赖请求上下文，留在适配器
    if (countProposeInsertChars(data.operations) > MAX_PROPOSE_INSERT_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `插入文本总计超过 ${MAX_PROPOSE_INSERT_CHARS} 字符上限`
      })
    }
  })

const writerInsertTextOpSchema = z.object({
  kind: z.literal('insert_text'),
  blockId: z.string().min(1),
  offset: z.number().int().nonnegative(),
  text: z.string()
})

const writerReplaceTextOpSchema = z.object({
  kind: z.literal('replace_text'),
  blockId: z.string().min(1),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  text: z.string(),
  expectedTextHash: z.string().min(1)
})

const writerDeleteTextOpSchema = z.object({
  kind: z.literal('delete_text'),
  blockId: z.string().min(1),
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
  expectedTextHash: z.string().min(1)
})

const writerInsertBlocksOpSchema = z.object({
  kind: z.literal('insert_blocks'),
  afterBlockId: z.string().min(1).optional(),
  blocks: z.array(writerAiContextBlockSchema).min(1)
})

const writerReplaceBlocksOpSchema = z.object({
  kind: z.literal('replace_blocks'),
  targetBlockIds: z.array(z.string().min(1)).min(1),
  blocks: z.array(writerAiContextBlockSchema).min(1),
  expectedBlockHashes: z.record(z.string(), z.string())
})

export const writerEditOperationSchema: z.ZodType<WriterEditOperation> = z.discriminatedUnion(
  'kind',
  [
    writerInsertTextOpSchema,
    writerReplaceTextOpSchema,
    writerDeleteTextOpSchema,
    writerInsertBlocksOpSchema,
    writerReplaceBlocksOpSchema
  ]
)

export const writerAiProposalSchema: z.ZodType<WriterAiProposal> = z.object({
  proposalId: z.string().min(1),
  documentId: writerIdSchema,
  baseRevision: z.number().int().nonnegative(),
  anchor: writerAiAnchorSchema,
  operations: z.array(writerEditOperationSchema).min(1).max(100),
  createdAt: z.string().min(1)
})
