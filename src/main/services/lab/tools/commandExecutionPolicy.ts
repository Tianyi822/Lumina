import type { UserInteractionOption } from '@shared/types/chat'

/** 命令执行目标环境类型 */
export type CommandExecutionTarget = 'lab_sandbox' | 'host'

/** 命令执行策略决策结果 */
export interface CommandExecutionPolicyDecision {
  target: CommandExecutionTarget
  command: string
  canExecute: boolean
  requiresUserInteraction: boolean
  reason?: string
  options?: UserInteractionOption[]
}

const HOST_COMMAND_OPTIONS: UserInteractionOption[] = [
  {
    value: 'allow_host',
    label: '允许执行',
    description: '在本机宿主环境执行该命令'
  },
  {
    value: 'cancel',
    label: '取消',
    description: '不执行该宿主机命令'
  },
  {
    value: 'use_lab_sandbox',
    label: '改在实验室沙箱中执行',
    description: '把命令放到 Docker 实验室容器内执行'
  }
]

/**
 * 判断命令是否可直接执行。
 * Docker 实验室容器是沙箱环境；宿主机命令必须先让用户确认。
 */
export function getCommandExecutionPolicy(
  target: CommandExecutionTarget,
  command: string
): CommandExecutionPolicyDecision {
  if (target === 'lab_sandbox') {
    return {
      target,
      command,
      canExecute: true,
      requiresUserInteraction: false
    }
  }

  return {
    target,
    command,
    canExecute: false,
    requiresUserInteraction: true,
    reason: '宿主机命令需要用户确认后才能执行',
    options: HOST_COMMAND_OPTIONS
  }
}
