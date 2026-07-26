import type { SessionData } from '@renderer/types'
import type { WriterAiScope } from '@shared/types/writer'

export interface SendWriterAiTurnOptions {
  scope?: WriterAiScope
  includeExternalTools?: boolean
  /** 懒加载 ensureSession 后同 tick 传入，避免 latestRef 仍为 null */
  session?: SessionData
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
