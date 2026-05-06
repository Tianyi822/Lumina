import { PassThrough } from 'stream'
import { logger } from '@main/services/logger'
import type { ExecCommand, ExecResult } from '@shared/types/lab'
import type { DockerServiceContext } from './types'

/**
 * Docker 命令执行服务
 */
export class DockerExecService {
  private readonly context: DockerServiceContext

  constructor(context: DockerServiceContext) {
    this.context = context
  }

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
      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      const stdout = new PassThrough()
      const stderr = new PassThrough()

      stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(Buffer.from(chunk))
      })
      stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(Buffer.from(chunk))
      })

      this.context.getDocker().modem.demuxStream(stream, stdout, stderr)

      return new Promise((resolve) => {
        const timeout = setTimeout(
          () => {
            stream.destroy()
            stdout.destroy()
            stderr.destroy()
            resolve({
              exitCode: -1,
              stdout: '',
              stderr: '命令执行超时',
              duration: Date.now() - startTime
            })
          },
          (command.timeout || 30) * 1000
        )

        stream.on('end', async () => {
          clearTimeout(timeout)
          stdout.end()
          stderr.end()

          try {
            const inspect = await exec.inspect()

            resolve({
              exitCode: inspect.ExitCode || 0,
              stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
              stderr: Buffer.concat(stderrChunks).toString('utf-8'),
              duration: Date.now() - startTime
            })
          } catch (error) {
            resolve({
              exitCode: -1,
              stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
              stderr: error instanceof Error ? error.message : String(error),
              duration: Date.now() - startTime,
              systemError: true
            })
          }
        })

        stream.on('error', (error: Error) => {
          clearTimeout(timeout)
          stdout.destroy()
          stderr.destroy()
          resolve({
            exitCode: -1,
            stdout: '',
            stderr: error.message,
            duration: Date.now() - startTime,
            systemError: true
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

      return null
    }
  }
}
