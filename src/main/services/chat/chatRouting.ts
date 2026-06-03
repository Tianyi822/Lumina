import type { ChatRequest } from '../../types/chat'

export function shouldUsePlanExecute(
  request: Pick<ChatRequest, 'sessionType' | 'enablePlanMode'>
): boolean {
  return request.sessionType === 'paper' && request.enablePlanMode === true
}
