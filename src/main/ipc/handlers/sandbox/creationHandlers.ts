import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import type {
  PortMappingInput,
  ComposeOptions,
  ComposeResult,
  CreateFromDockerfileResult
} from '@shared/types/sandbox'
import {
  getSandboxServices,
  normalizeSandboxError,
  sanitizeDockerName,
  updateSandboxMetadata
} from './shared'

/**
 * 注册沙箱创建处理器
 */
export function registerSandboxCreationHandlers(): void {
  const { dockerService, configService } = getSandboxServices()

  ipcMain.handle(
    'sandbox:createFromDockerfile',
    async (
      _event,
      dockerfile: string,
      context: string | undefined,
      sandboxId: string | undefined,
      sandboxName: string | undefined,
      userPortMappings: PortMappingInput[] | undefined
    ): Promise<CreateFromDockerfileResult> => {
      try {
        logger.info('开始从 Dockerfile 创建沙箱', 'main', {
          context,
          sandboxId,
          sandboxName,
          dockerfileLength: dockerfile.length,
          userPortMappings
        })

        const dockerName = sanitizeDockerName(
          sandboxName || `dockerfile-${Date.now()}`,
          'sandbox-dockerfile-'
        )

        const buildResult = await dockerService.buildImageFromDockerfile({
          dockerfile,
          context,
          tag: dockerName
        })

        if (!buildResult.success || !buildResult.imageId) {
          logger.error('从 Dockerfile 构建镜像失败', 'main', {
            error: buildResult.error
          })
          return {
            success: false,
            error: buildResult.error || '构建镜像失败'
          }
        }

        let ports: Array<{
          containerPort: number
          hostPort?: number
          protocol?: 'tcp' | 'udp'
        }> = []

        if (userPortMappings && userPortMappings.length > 0) {
          ports = userPortMappings.map((portMapping) => ({
            containerPort: portMapping.containerPort,
            hostPort: portMapping.hostPort ?? undefined,
            protocol: portMapping.protocol
          }))
          logger.info('使用用户指定的端口映射', 'main', { ports })
        } else {
          try {
            const imageInspect = await dockerService.inspectImage(buildResult.imageId)
            if (imageInspect?.Config?.ExposedPorts) {
              ports = Object.keys(imageInspect.Config.ExposedPorts).map((port) => {
                const [portNum, protocol] = port.split('/')
                return {
                  containerPort: parseInt(portNum, 10),
                  protocol: (protocol as 'tcp' | 'udp') || 'tcp'
                }
              })
              logger.info('获取到镜像暴露端口', 'main', { ports })
            }
          } catch (error) {
            logger.warn('获取镜像暴露端口失败，将不进行端口映射', 'main', {
              error: normalizeSandboxError(error, '获取镜像暴露端口失败')
            })
          }
        }

        const containerResult = await dockerService.createContainerFromImage({
          imageId: buildResult.imageId,
          name: dockerName,
          ports
        })

        if (!containerResult.success || !containerResult.containerId) {
          logger.error('创建容器失败', 'main', {
            error: containerResult.error
          })
          return {
            success: false,
            error: containerResult.error || '创建容器失败'
          }
        }

        if (sandboxId) {
          updateSandboxMetadata(sandboxId, (sandbox) => {
            sandbox.containerIds = [containerResult.containerId!]
            sandbox.primaryContainerId = containerResult.containerId
            sandbox.status = 'running'
            sandbox.updatedAt = new Date().toISOString()
          })
        }

        logger.info('从 Dockerfile 创建沙箱成功', 'main', {
          containerId: containerResult.containerId.substring(0, 12),
          containerName: dockerName
        })

        return {
          success: true,
          containerId: containerResult.containerId
        }
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '从 Dockerfile 创建沙箱失败')
        logger.error('从 Dockerfile 创建沙箱失败', 'main', { error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle(
    'sandbox:createFromCompose',
    async (
      _event,
      content: string,
      options: ComposeOptions | undefined,
      sandboxId: string | undefined,
      sandboxName: string | undefined
    ): Promise<ComposeResult> => {
      try {
        const projectName = sanitizeDockerName(
          sandboxName || options?.projectName || `compose-${Date.now()}`,
          'sandbox-docker-compose-'
        )

        logger.info('开始从 docker-compose 创建沙箱', 'main', {
          projectName,
          sandboxId,
          sandboxName,
          contentLength: content.length,
          dockerfiles: options?.dockerfiles
        })

        const dockerfileConfigs: Array<{
          id: string
          content: string
          targetContext: string
          targetFilename: string
        }> = []

        if (options?.dockerfiles && options.dockerfiles.length > 0) {
          for (const dockerfile of options.dockerfiles) {
            const loadResult = configService.loadDockerfile(dockerfile.dockerfileId)
            if (loadResult.success && loadResult.config) {
              dockerfileConfigs.push({
                id: dockerfile.dockerfileId,
                content: loadResult.config.content,
                targetContext: dockerfile.targetContext || './app',
                targetFilename: dockerfile.targetFilename || 'Dockerfile'
              })
            } else {
              logger.warn('加载 Dockerfile 配置失败，跳过', 'main', {
                dockerfileId: dockerfile.dockerfileId,
                error: loadResult.error
              })
            }
          }
        }

        const upResult = await dockerService.composeUp({
          composeContent: content,
          projectName,
          dockerfileConfigs: dockerfileConfigs.length > 0 ? dockerfileConfigs : undefined
        })

        if (!upResult.success) {
          logger.error('docker compose up 失败', 'main', {
            error: upResult.error,
            projectName
          })
          return {
            success: false,
            containerIds: [],
            failedServices: [],
            error: upResult.error || 'docker compose up 失败'
          }
        }

        if (sandboxId && upResult.containerIds && upResult.containerIds.length > 0) {
          updateSandboxMetadata(sandboxId, (sandbox) => {
            sandbox.containerIds = upResult.containerIds || []
            sandbox.primaryContainerId = upResult.containerIds?.[0]
            sandbox.composeProjectName = projectName
            sandbox.status = 'running'
            sandbox.updatedAt = new Date().toISOString()
          })
        }

        logger.info('从 docker-compose 创建沙箱成功', 'main', {
          projectName,
          containerCount: upResult.containerIds?.length || 0
        })

        return {
          success: true,
          containerIds: upResult.containerIds || [],
          failedServices: []
        }
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '从 docker-compose 创建沙箱失败')
        logger.error('从 docker-compose 创建沙箱失败', 'main', { error: errorMessage })
        return {
          success: false,
          containerIds: [],
          failedServices: [],
          error: errorMessage
        }
      }
    }
  )
}
