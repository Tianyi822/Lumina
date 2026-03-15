import { logger } from '@main/services/logger'
import type { ExecCommand, ExecResult } from '@shared/types/sandbox'
import type { DockerServiceContext } from './types'

/**
 * Docker 命令执行服务
 */
export class DockerExecService {
  constructor(private readonly context: DockerServiceContext) {}

  /**
   * 在容器内执行命令
   * @param containerId 容器 ID
   * @param command 执行参数
   * @returns 执行结果
   */
  async execCommand(containerId: string, command: ExecCommand): Promise<ExecResult | null> {
    const startTime = Date.now()

    try {
      const container = this.context.getDocker().getContainer(containerId)
      const exec = await container.exec({
        Cmd: ['sh', '-c', command.command],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: command.workdir,
        Env: command.env
          ? Object.entries(command.env).map(([key, value]) => `${key}=${value}`)
          : undefined
      })

      const stream = await exec.start({})
      const chunks: Buffer[] = []

      return new Promise((resolve) => {
        const timeout = setTimeout(
          () => {
            stream.destroy()
            resolve({
              exitCode: -1,
              stdout: '',
              stderr: '命令执行超时',
              duration: Date.now() - startTime
            })
          },
          (command.timeout || 30) * 1000
        )

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        stream.on('end', async () => {
          clearTimeout(timeout)
          const output = Buffer.concat(chunks).toString('utf-8')
          const inspect = await exec.inspect()

          resolve({
            exitCode: inspect.ExitCode || 0,
            stdout: output,
            stderr: '',
            duration: Date.now() - startTime
          })
        })

        stream.on('error', (error: Error) => {
          clearTimeout(timeout)
          resolve({
            exitCode: -1,
            stdout: '',
            stderr: error.message,
            duration: Date.now() - startTime
          })
        })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('执行命令失败', 'main', {
        error: errorMessage,
        containerId,
        command: command.command
      })

      return {
        exitCode: -1,
        stdout: '',
        stderr: errorMessage,
        duration: Date.now() - startTime
      }
    }
  }
}
