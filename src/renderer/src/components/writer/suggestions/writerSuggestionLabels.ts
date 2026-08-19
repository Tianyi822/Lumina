import { i18n } from '@renderer/i18n'

export type WriterSuggestionPendingAction = 'rewrite' | 'continue'

export function getWriterSuggestionPendingLabel(
  action: WriterSuggestionPendingAction | null | undefined
): string {
  if (action === 'rewrite') return i18n.t('writer.suggestions.rewriting')
  if (action === 'continue') return i18n.t('writer.suggestions.continuing')
  return i18n.t('writer.suggestions.generating')
}
