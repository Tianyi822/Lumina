import { z } from 'zod'
import type {
  SaveWriterDocumentRequest,
  WriterDocument,
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
