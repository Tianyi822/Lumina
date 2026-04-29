import { exec } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'
import { logger } from '@main/services/logger'
import type {
  ComposeDownOptions,
  ComposeDownResult,
  ComposeExecOptions,
  ComposeExecResult,
  ComposeLogOptions,
  ComposeLogResult,
  ComposeProjectStatus,
  ComposeRestartResult,
  ComposeServiceStatus,
  ComposeStopOptions,
  ComposeStopResult,
  LabResult
} from '@shared/types/lab'
import { getDockerConfigService } from './DockerConfigService'
import { DockerContainerService } from './DockerContainerService'
import { DockerExecService } from './DockerExecService'
import { DockerStatsService } from './DockerStatsService'
import {
  copyDirectory,
  deduplicateServices,
  inferBaseImage,
  parseBuildContexts
} from './DockerComposeUtils'
import type { ComposeUpOptions, ComposeUpResult, DockerServiceContext } from './types'

const execAsync = promisify(exec)

/**
 * Docker Compose 编排服务
 */
export class DockerComposeService {
  constructor(
    private readonly context: DockerServiceContext,
    private readonly containerService: DockerContainerService,
    private readonly execService: DockerExecService,
    private readonly statsService: DockerStatsService
  ) {}

  /**
   * 执行 docker compose down
   * @param projectName 项目名
   * @returns 操作结果
   */
  async composeDown(projectName: string): Promise<LabResult> {
    this.context.getDocker()

    try {
      const { stdout, stderr } = await execAsync(`docker compose -p "${projectName}" down`, {
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 10
      })

      logger.info('Docker Compose down 成功', 'main', {
        projectName,
        stdout
      })

      if (stderr) {
        logger.warn('Docker Compose down 有警告输出', 'main', {
          projectName,
          stderr
        })
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Docker Compose down 失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 执行 docker compose up
   * @param options 启动选项
   * @returns 启动结果
   */
  async composeUp(options: ComposeUpOptions): Promise<ComposeUpResult> {
    this.context.getDocker()

    const upLogChunks: string[] = []

    try {
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'docker-compose-'))

      try {
        const cleanedContent = deduplicateServices(options.composeContent)
        const composePath = path.join(tempDir, 'docker-compose.yaml')
        await fs.promises.writeFile(composePath, cleanedContent, 'utf-8')

        const buildContexts = parseBuildContexts(cleanedContent)
        const configService = getDockerConfigService()
        const savedDockerfiles = configService.listDockerfiles().configs || []

        for (const context of buildContexts) {
          const contextDir = path.join(tempDir, context.context)

          try {
            await fs.promises.access(contextDir)
            logger.debug('构建上下文目录已存在', 'main', { context: context.context })
          } catch {
            await fs.promises.mkdir(contextDir, { recursive: true })
            logger.info('创建构建上下文目录', 'main', {
              context: context.context,
              service: context.service
            })

            const contextName = path.basename(context.context)
            const matchingConfig = savedDockerfiles.find(
              (dockerfile) => dockerfile.name.toLowerCase() === contextName.toLowerCase()
            )

            const dockerfileName = context.dockerfile || 'Dockerfile'
            const dockerfilePath = path.join(contextDir, dockerfileName)

            if (matchingConfig) {
              const loadResult = configService.loadDockerfile(matchingConfig.id)
              if (loadResult.success && loadResult.config) {
                await fs.promises.writeFile(dockerfilePath, loadResult.config.content, 'utf-8')
                logger.info('从保存的 Dockerfile 配置加载', 'main', {
                  service: context.service,
                  context: context.context,
                  configId: matchingConfig.id,
                  configName: matchingConfig.name
                })
              } else {
                logger.warn('加载 Dockerfile 配置失败，使用默认配置', 'main', {
                  configId: matchingConfig.id,
                  error: loadResult.error
                })
                const defaultImage = inferBaseImage(context.service)
                const defaultDockerfile = `FROM ${defaultImage}\n\nWORKDIR /app\n\n# 默认 Dockerfile，请根据实际需要修改\n`
                await fs.promises.writeFile(dockerfilePath, defaultDockerfile, 'utf-8')
              }
            } else {
              const defaultImage = inferBaseImage(context.service)
              const defaultDockerfile = `FROM ${defaultImage}\n\nWORKDIR /app\n\n# 默认 Dockerfile，请根据实际需要修改\n`
              await fs.promises.writeFile(dockerfilePath, defaultDockerfile, 'utf-8')
              logger.info('创建默认 Dockerfile', 'main', {
                service: context.service,
                dockerfile: dockerfileName,
                image: defaultImage
              })
            }
          }
        }

        if (options.dockerfileConfigs && options.dockerfileConfigs.length > 0) {
          for (const dockerfileConfig of options.dockerfileConfigs) {
            const contextDir = path.join(tempDir, dockerfileConfig.targetContext)
            await fs.promises.mkdir(contextDir, { recursive: true })

            const dockerfilePath = path.join(contextDir, dockerfileConfig.targetFilename)
            await fs.promises.writeFile(dockerfilePath, dockerfileConfig.content, 'utf-8')

            logger.info('复制 Dockerfile 配置到临时目录', 'main', {
              id: dockerfileConfig.id,
              targetPath: path.join(dockerfileConfig.targetContext, dockerfileConfig.targetFilename)
            })
          }
        }

        if (options.workingDir) {
          const workPath = path.resolve(options.workingDir)
          const workStat = await fs.promises.stat(workPath)

          if (workStat.isDirectory()) {
            const files = await fs.promises.readdir(workPath)
            await Promise.all(
              files
                .filter((file) => file !== 'docker-compose.yaml' && file !== 'docker-compose.yml')
                .map(async (file) => {
                  const srcPath = path.join(workPath, file)
                  const destPath = path.join(tempDir, file)

                  try {
                    const srcStat = await fs.promises.stat(srcPath)
                    if (srcStat.isDirectory()) {
                      await copyDirectory(srcPath, destPath)
                    } else {
                      await fs.promises.copyFile(srcPath, destPath)
                    }
                  } catch (error) {
                    logger.warn('复制工作目录文件失败', 'main', { file, error })
                  }
                })
            )
          }
        }

        logger.info('执行 Docker Compose up', 'main', {
          projectName: options.projectName,
          composePath,
          noPull: options.noPull || false
        })

        // 构建命令，当 noPull 为 true 时添加 --pull never 参数禁止拉取镜像
        const pullArg = options.noPull ? ' --pull never' : ''
        const command = `cd "${tempDir}" && docker compose -p "${options.projectName}" up -d${pullArg}`
        const { stdout, stderr } = await execAsync(command, {
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 10
        })

        upLogChunks.push(stdout)

        if (stderr) {
          upLogChunks.push(`WARNING: ${stderr}`)
          logger.warn('Docker Compose up 有警告输出', 'main', {
            projectName: options.projectName,
            stderr
          })
        }

        const containers = await this.containerService.getContainersByComposeProject(
          options.projectName
        )
        const containerIds = containers.map((container) => container.id)

        logger.info('Docker Compose up 成功', 'main', {
          projectName: options.projectName,
          containerCount: containerIds.length
        })

        return {
          success: true,
          containerIds,
          upLog: upLogChunks.join('\n')
        }
      } finally {
        try {
          await fs.promises.rm(tempDir, { recursive: true, force: true })
        } catch (error) {
          logger.warn('清理临时目录失败', 'main', { error })
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Docker Compose up 失败', 'main', {
        error: errorMessage,
        projectName: options.projectName
      })
      return {
        success: false,
        error: errorMessage,
        upLog: upLogChunks.join('\n')
      }
    }
  }

  /**
   * 启动 Compose 项目
   * @param projectName 项目名
   * @returns 启动结果
   */
  async composeStart(
    projectName: string
  ): Promise<{ success: boolean; error?: string; containerIds?: string[] }> {
    this.context.getDocker()

    try {
      const containers = await this.containerService.getContainersByComposeProject(projectName)

      if (containers.length === 0) {
        logger.warn('Compose 项目没有容器', 'main', { projectName })
        return { success: true, containerIds: [] }
      }

      const startedContainerIds: string[] = []

      for (const container of containers) {
        if (container.state !== 'running') {
          const result = await this.containerService.startContainer(container.id)
          if (result.success) {
            startedContainerIds.push(container.id)
          }
        }
      }

      logger.info('Compose 项目容器启动成功', 'main', {
        projectName,
        startedCount: startedContainerIds.length
      })

      return { success: true, containerIds: startedContainerIds }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('启动 Compose 项目失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 停止 Compose 项目
   * @param projectName 项目名
   * @param options 停止选项
   * @returns 停止结果
   */
  async composeStop(projectName: string, options?: ComposeStopOptions): Promise<ComposeStopResult> {
    this.context.getDocker()

    try {
      const containers = await this.containerService.getContainersByComposeProject(projectName)

      if (containers.length === 0) {
        logger.warn('Compose 项目没有运行的容器', 'main', { projectName })
        return { success: true, stoppedContainerIds: [] }
      }

      const stoppedContainerIds: string[] = []

      for (const container of containers) {
        if (container.state === 'running') {
          const result = await this.containerService.stopContainer(container.id, options?.timeout)
          if (result.success) {
            stoppedContainerIds.push(container.id)
          }
        }
      }

      logger.info('Compose 项目容器停止成功', 'main', {
        projectName,
        stoppedCount: stoppedContainerIds.length
      })

      return { success: true, stoppedContainerIds }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('停止 Compose 项目失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 重启 Compose 项目
   * @param projectName 项目名
   * @returns 重启结果
   */
  async composeRestart(projectName: string): Promise<ComposeRestartResult> {
    this.context.getDocker()

    try {
      const containers = await this.containerService.getContainersByComposeProject(projectName)

      if (containers.length === 0) {
        logger.warn('Compose 项目没有容器', 'main', { projectName })
        return { success: true, restartedContainerIds: [] }
      }

      const restartedContainerIds: string[] = []

      for (const container of containers) {
        const result = await this.containerService.restartContainer(container.id)
        if (result.success) {
          restartedContainerIds.push(container.id)
        }
      }

      logger.info('Compose 项目容器重启成功', 'main', {
        projectName,
        restartedCount: restartedContainerIds.length
      })

      return { success: true, restartedContainerIds }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('重启 Compose 项目失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 获取 Compose 项目状态
   * @param projectName 项目名
   * @returns 状态结果
   */
  async composeStatus(
    projectName: string
  ): Promise<{ success: boolean; status?: ComposeProjectStatus; error?: string }> {
    this.context.getDocker()

    try {
      const containers = await this.containerService.getContainersByComposeProject(projectName)
      const servicesMap = new Map<string, ComposeServiceStatus>()

      for (const container of containers) {
        const serviceLabel = container.labels['com.docker.compose.service']
        if (!serviceLabel) {
          continue
        }

        const existing = servicesMap.get(serviceLabel)
        if (existing) {
          if (container.state === 'running' && existing.state !== 'running') {
            servicesMap.set(serviceLabel, {
              name: serviceLabel,
              state: container.state,
              containerId: container.id,
              ports: container.ports
            })
          }
        } else {
          servicesMap.set(serviceLabel, {
            name: serviceLabel,
            state: container.state,
            containerId: container.id,
            ports: container.ports
          })
        }
      }

      return {
        success: true,
        status: {
          projectName,
          services: Array.from(servicesMap.values())
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 Compose 项目状态失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 在 Compose 服务中执行命令
   * @param projectName 项目名
   * @param serviceName 服务名
   * @param command 命令
   * @param options 执行选项
   * @returns 执行结果
   */
  async composeExec(
    projectName: string,
    serviceName: string,
    command: string,
    options?: ComposeExecOptions
  ): Promise<ComposeExecResult> {
    this.context.getDocker()

    try {
      const containers = await this.containerService.getContainersByComposeProject(projectName)
      const targetContainer = containers.find(
        (container) =>
          container.labels['com.docker.compose.service'] === serviceName &&
          container.state === 'running'
      )

      if (!targetContainer) {
        return { success: false, error: `服务 ${serviceName} 没有运行中的容器` }
      }

      const execResult = await this.execService.execCommand(targetContainer.id, {
        command,
        workdir: options?.workdir,
        env: options?.env,
        timeout: options?.timeout
      })

      if (!execResult) {
        return { success: false, error: '命令执行失败' }
      }

      return { success: true, result: execResult }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('在 Compose 服务中执行命令失败', 'main', {
        error: errorMessage,
        projectName,
        serviceName
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 获取 Compose 项目日志
   * @param projectName 项目名
   * @param options 日志选项
   * @returns 日志结果
   */
  async composeLogs(projectName: string, options?: ComposeLogOptions): Promise<ComposeLogResult> {
    this.context.getDocker()

    try {
      let containers = await this.containerService.getContainersByComposeProject(projectName)

      if (options?.service) {
        containers = containers.filter(
          (container) => container.labels['com.docker.compose.service'] === options.service
        )
      }

      if (containers.length === 0) {
        return { success: true, logs: '' }
      }

      const allLogs: string[] = []

      for (const container of containers) {
        const serviceName = container.labels['com.docker.compose.service'] || 'unknown'
        const logs = await this.statsService.getContainerLogs(container.id, {
          tail: options?.tail,
          since: options?.since,
          until: options?.until
        })

        const lines = logs.split('\n').filter(Boolean)
        for (const line of lines) {
          allLogs.push(`[${serviceName}] ${line}`)
        }
      }

      return { success: true, logs: allLogs.join('\n') }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 Compose 项目日志失败', 'main', {
        error: errorMessage,
        projectName
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 执行扩展版 docker compose down
   * @param projectName 项目名
   * @param options down 选项
   * @returns 删除结果
   */
  async composeDownExtended(
    projectName: string,
    options?: ComposeDownOptions
  ): Promise<ComposeDownResult> {
    this.context.getDocker()

    try {
      const containers = await this.containerService.getContainersByComposeProject(projectName)
      const containerIds = containers.map((container) => container.id)
      const cmdParts = ['docker', 'compose', '-p', `"${projectName}"`, 'down']

      if (options?.removeVolumes) {
        cmdParts.push('-v')
      }

      if (options?.removeOrphans) {
        cmdParts.push('--remove-orphans')
      }

      if (options?.force) {
        cmdParts.push('-t', '0')
      }

      const { stdout, stderr } = await execAsync(cmdParts.join(' '), {
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 10
      })

      logger.info('Docker Compose down 成功', 'main', {
        projectName,
        stdout: stdout.substring(0, 500)
      })

      if (stderr) {
        logger.warn('Docker Compose down 有警告输出', 'main', {
          projectName,
          stderr: stderr.substring(0, 200)
        })
      }

      const removedVolumes: string[] = []
      const volumeMatches = stdout.match(/Volume\s+(\S+)\s+/g) || []
      for (const match of volumeMatches) {
        removedVolumes.push(match.replace(/Volume\s+(\S+)\s+/, '$1'))
      }

      return {
        success: true,
        removedContainerIds: containerIds,
        removedVolumes
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Docker Compose down 失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }
}
