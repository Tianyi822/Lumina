import type { ExecCommand, ExecResult } from '@shared/types/lab'
import type { CommandExecutor } from '../interfaces/CommandExecutor'
import { sshConnectionManager } from './SshConnectionManager'
import { logger } from '@main/services/logger'

/**
 * SSH 命令执行器
 * 通过 SSH2 协议的 exec 通道在远程服务器上执行命令
 */
export class SshCommandExecutor implements CommandExecutor {
  /**
   * 在远程服务器上执行命令
   * 支持设置工作目录、环境变量和超时时间
   * @param labId - 实验室 ID
   * @param command - 命令参数（含命令、工作目录、环境变量、超时等）
   * @returns 执行结果（退出码、标准输出/错误、耗时），未连接返回 null
   */
  async execCommand(labId: string, command: ExecCommand): Promise<ExecResult | null> {
    const client = sshConnectionManager.getClient(labId)
    if (!client) {
      logger.warn('SSH 客户端未连接', 'main', { labId })
      return null
    }

    const startTime = Date.now()
    // 构建环境变量前缀字符串，特殊字符转义以安全传递给 shell
    const envPrefix = command.env
      ? Object.entries(command.env)
          .map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'`)
          .join(' ') + ' '
      : ''
    // 如有工作目录则用 cd 进入后再执行
    const fullCommand = command.workdir
      ? `cd "${command.workdir}" && ${envPrefix}${command.command}`
      : `${envPrefix}${command.command}`

    return new Promise((resolve) => {
      // 设置超时定时器
      const timeout = setTimeout(
        () => {
          resolve({
            exitCode: -1,
            stdout: '',
            stderr: '命令执行超时',
            duration: Date.now() - startTime
          })
        },
        (command.timeout || 30) * 1000
      )

      client.exec(fullCommand, (err, stream) => {
        if (err) {
          clearTimeout(timeout)
          resolve({
            exitCode: -1,
            stdout: '',
            stderr: err.message,
            duration: Date.now() - startTime,
            systemError: true
          })
          return
        }

        const stdoutChunks: Buffer[] = []
        const stderrChunks: Buffer[] = []

        stream.on('data', (data: Buffer) => stdoutChunks.push(data))
        stream.stderr.on('data', (data: Buffer) => stderrChunks.push(data))

        // 命令执行完毕时收集最终结果
        stream.on('close', (code: number | null) => {
          clearTimeout(timeout)
          resolve({
            exitCode: code ?? -1,
            stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
            stderr: Buffer.concat(stderrChunks).toString('utf-8'),
            duration: Date.now() - startTime
          })
        })

        stream.on('error', (streamErr: Error) => {
          clearTimeout(timeout)
          resolve({
            exitCode: -1,
            stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
            stderr: streamErr.message,
            duration: Date.now() - startTime,
            systemError: true
          })
        })
      })
    })
  }
}
