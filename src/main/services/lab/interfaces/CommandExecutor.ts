import type { ExecCommand, ExecResult } from '@shared/types/lab'

/**
 * 命令执行器抽象接口
 * Docker 实现：targetId = containerId，通过 docker exec 执行
 * SSH 实现：targetId = labId，通过 SSH exec 执行
 */
export interface CommandExecutor {
  execCommand(targetId: string, command: ExecCommand): Promise<ExecResult | null>
}
