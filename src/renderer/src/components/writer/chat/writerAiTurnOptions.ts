import type { WriterAiScope } from '@shared/types/writer'

export interface SendWriterAiTurnOptions {
  scope?: WriterAiScope
  includeExternalTools?: boolean
}

export function resolveWriterAiTurnOptions(options?: SendWriterAiTurnOptions): {
  scope: WriterAiScope
  includeExternalTools: boolean
} {
  return {
    scope: options?.scope ?? 'document',
    includeExternalTools: options?.includeExternalTools ?? true
  }
}
