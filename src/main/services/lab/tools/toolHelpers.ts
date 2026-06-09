import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ExecResult, LabData } from '@shared/types/lab'

/** 命令执行结果负载（供 AI 工具返回格式使用） */
interface ExecCommandToolPayload {
  command: string
  workdir?: string
  exit_code: number
  duration_ms: number
  stdout: string
  stderr: string
}

/**
 * 构建命令执行结果的负载对象
 */
export function buildExecCommandToolPayload(
  command: string,
  workdir: string | undefined,
  result: ExecResult
): ExecCommandToolPayload {
  return {
    command,
    workdir,
    exit_code: result.exitCode,
    duration_ms: result.duration,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

/**
 * 将执行结果格式化为 MCP 工具调用结果（JSON 字符串返回）
 */
export function formatExecCommandToolResult(
  command: string,
  workdir: string | undefined,
  result: ExecResult
): MCPToolCallResult {
  return {
    success: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(buildExecCommandToolPayload(command, workdir, result), null, 2)
      }
    ]
  }
}

/**
 * 解析写入操作的项目根目录
 * 当前直接返回显式指定的 projectRoot，未来可扩展实验室默认路径
 */
export function resolveProjectRootForWrite(
  _lab: Pick<LabData, 'backendType'>,
  explicitProjectRoot?: string
): string | undefined {
  return explicitProjectRoot
}
