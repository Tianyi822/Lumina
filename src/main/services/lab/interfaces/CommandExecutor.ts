import type { ExecCommand, ExecResult } from '@shared/types/lab'

/**
 * 命令执行器抽象接口
 * Docker 实现：targetId = containerId，通过 docker exec 执行
 * SSH 实现：targetId = labId，通过 SSH exec 执行
 * @param targetId - 执行目标标识（容器 ID 或实验室 ID）
 * @param command - 待执行命令
 * @returns 执行结果，未连接或出错返回 null
 */
export interface CommandExecutor {
  execCommand(targetId: string, command: ExecCommand): Promise<ExecResult | null>
}
