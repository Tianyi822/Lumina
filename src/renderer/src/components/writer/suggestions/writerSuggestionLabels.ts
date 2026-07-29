export type WriterSuggestionPendingAction = 'rewrite' | 'continue'

export function getWriterSuggestionPendingLabel(
  action: WriterSuggestionPendingAction | null | undefined
): string {
  if (action === 'rewrite') return 'AI 正在改写…'
  if (action === 'continue') return 'AI 正在续写…'
  return 'AI 正在生成建议…'
}
