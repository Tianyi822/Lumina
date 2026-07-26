import type { WriterSuggestionPendingAction } from '@renderer/components/writer/suggestions/writerSuggestionLabels'
import type { SessionData } from '@renderer/types'
import type { WriterAiScope } from '@shared/types/writer'

export interface SendWriterAiTurnOptions {
  scope?: WriterAiScope
  includeExternalTools?: boolean
  /** 懒加载 ensureSession 后同 tick 传入，避免 latestRef 仍为 null */
  session?: SessionData
  /** 气泡改写/续写等待文案；由 sendMessage 直接读取，不进入 resolve */
  pendingAction?: WriterSuggestionPendingAction
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
