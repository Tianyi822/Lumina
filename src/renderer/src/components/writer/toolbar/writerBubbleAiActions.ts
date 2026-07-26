import type { SendWriterAiTurnOptions } from '@renderer/components/writer/chat/writerAiTurnOptions'

export type WriterBubbleAiAction = 'rewrite' | 'continue'

export const WRITER_BUBBLE_REWRITE_PROMPT =
  '请改写当前选区，保持原意，使表达更清晰、流畅；只通过写作编辑工具提交建议，不要扩大选区范围。'

export const WRITER_BUBBLE_CONTINUE_PROMPT =
  '请在当前选区之后续写，语气与上下文一致；只通过写作编辑工具提交建议，不要改写选区本身，也不要扩大范围。'

export function getWriterBubbleAiPrompt(action: WriterBubbleAiAction): string {
  return action === 'rewrite' ? WRITER_BUBBLE_REWRITE_PROMPT : WRITER_BUBBLE_CONTINUE_PROMPT
}

export function buildWriterBubbleSendOptions(): SendWriterAiTurnOptions {
  return { scope: 'selection', includeExternalTools: false }
}

export type WriterBubbleAiGateResult =
  | { ok: true }
  | { ok: false; reason: 'busy' | 'no_model' }

export function canStartWriterBubbleAiAction(input: {
  isSending: boolean
  selectedModel: string
}): WriterBubbleAiGateResult {
  if (input.isSending) return { ok: false, reason: 'busy' }
  if (!input.selectedModel.trim()) return { ok: false, reason: 'no_model' }
  return { ok: true }
}
