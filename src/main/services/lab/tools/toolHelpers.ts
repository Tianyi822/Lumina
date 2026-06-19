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
  truncated?: boolean
  total_bytes?: number
}

/** exec_command 输出截断选项 */
export interface ExecTruncateOptions {
  maxBytes?: number
  head?: number
  tail?: number
}

/**
 * 构建命令执行结果的负载对象
 * 支持 head/tail 行截断与 maxBytes 字节级截断
 */
export function buildExecCommandToolPayload(
  command: string,
  workdir: string | undefined,
  result: ExecResult,
  options?: ExecTruncateOptions
): ExecCommandToolPayload {
  const maxBytes = options?.maxBytes ?? 20000
  let truncated = false
  let totalBytes: number | undefined
  let stdout = result.stdout
  let stderr = result.stderr

  // head 与 tail 互斥，head 优先
  if (options?.head != null) {
    const lines = result.stdout.split('\n')
    stdout = lines.slice(0, options.head).join('\n')
    if (lines.length > options.head) truncated = true
  } else if (options?.tail != null) {
    const lines = result.stdout.split('\n')
    stdout = lines.slice(-options.tail).join('\n')
    if (lines.length > options.tail) truncated = true
  }

  // 字节级截断（stdout 与 stderr 各自独立）；total_bytes 仅在字节截断时反映被截断流的原大小
  if (stdout.length > maxBytes) {
    totalBytes = stdout.length
    stdout = stdout.slice(0, maxBytes)
    truncated = true
  }
  if (stderr.length > maxBytes) {
    if (totalBytes === undefined) totalBytes = stderr.length
    stderr = stderr.slice(0, maxBytes)
    truncated = true
  }

  const payload: ExecCommandToolPayload = {
    command,
    workdir,
    exit_code: result.exitCode,
    duration_ms: result.duration,
    stdout,
    stderr
  }
  if (truncated) {
    payload.truncated = true
    if (totalBytes !== undefined) payload.total_bytes = totalBytes
  }
  return payload
}

/**
 * 将执行结果格式化为 MCP 工具调用结果（JSON 字符串返回）
 */
export function formatExecCommandToolResult(
  command: string,
  workdir: string | undefined,
  result: ExecResult,
  options?: ExecTruncateOptions
): MCPToolCallResult {
  return {
    success: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          buildExecCommandToolPayload(command, workdir, result, options),
          null,
          2
        )
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
