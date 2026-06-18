import type { UserInteractionOption } from '@shared/types/chat'

/** 命令执行策略决策结果 */
export interface CommandExecutionPolicyDecision {
  command: string
  canExecute: boolean
  requiresUserInteraction: boolean
  reason?: string
  options?: UserInteractionOption[]
}

/** Docker 沙箱已移除，SSH 实验室环境下命令固定直接执行 */
export function getCommandExecutionPolicy(command: string): CommandExecutionPolicyDecision {
  return { command, canExecute: true, requiresUserInteraction: false }
}
