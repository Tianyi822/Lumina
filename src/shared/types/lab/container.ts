/**
 * 命令执行相关通用类型
 */

/**
 * 执行命令请求
 */
export interface ExecCommand {
  /** 命令 */
  command: string
  /** 工作目录 */
  workdir?: string
  /** 环境变量 */
  env?: Record<string, string>
  /** 超时时间 (秒) */
  timeout?: number
}

/**
 * 执行命令结果
 */
export interface ExecResult {
  /** 退出码 */
  exitCode: number
  /** 标准输出 */
  stdout: string
  /** 标准错误 */
  stderr: string
  /** 执行时间 (毫秒) */
  duration: number
  /** 是否为系统级错误（如连接断开） */
  systemError?: boolean
}

/**
 * 命令执行结果（含 success 包装）
 */
export interface ExecCommandResult {
  success: boolean
  result?: ExecResult
  error?: string
}
