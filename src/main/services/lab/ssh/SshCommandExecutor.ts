import type { ExecCommand, ExecResult } from '@shared/types/lab'
import type { CommandExecutor } from '../interfaces/CommandExecutor'
import { sshConnectionManager } from './SshConnectionManager'
import { logger } from '@main/services/logger'

export class SshCommandExecutor implements CommandExecutor {
  async execCommand(labId: string, command: ExecCommand): Promise<ExecResult | null> {
    const client = sshConnectionManager.getClient(labId)
    if (!client) {
      logger.warn('SSH 客户端未连接', 'main', { labId })
      return null
    }

    const startTime = Date.now()
    const envPrefix = command.env
      ? Object.entries(command.env)
          .map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'`)
          .join(' ') + ' '
      : ''
    const fullCommand = command.workdir
      ? `cd "${command.workdir}" && ${envPrefix}${command.command}`
      : `${envPrefix}${command.command}`

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          exitCode: -1,
          stdout: '',
          stderr: '命令执行超时',
          duration: Date.now() - startTime
        })
      }, (command.timeout || 30) * 1000)

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
