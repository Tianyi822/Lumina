import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import type {
  PortMappingInput,
  ComposeOptions,
  ComposeResult,
  CreateFromDockerfileResult
} from '@shared/types/lab'
import { getLabServices, normalizeLabError, sanitizeDockerName, updateLabMetadata } from './shared'

/**
 * 注册实验室创建处理器
 */
export function registerLabCreationHandlers(): void {
  const { dockerService, configService } = getLabServices()

  ipcMain.handle(
    'lab:createFromDockerfile',
    async (
      _event,
      dockerfile: string,
      context: string | undefined,
      labId: string | undefined,
      labName: string | undefined,
      userPortMappings: PortMappingInput[] | undefined
    ): Promise<CreateFromDockerfileResult> => {
      try {
        logger.info('开始从 Dockerfile 创建实验室', 'main', {
          context,
          labId,
          labName,
          dockerfileLength: dockerfile.length,
          userPortMappings
        })

        const dockerName = sanitizeDockerName(
          labName || `dockerfile-${Date.now()}`,
          'lab-dockerfile-'
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
              error: normalizeLabError(error, '获取镜像暴露端口失败')
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

        if (labId) {
          updateLabMetadata(labId, (lab) => {
            lab.containerIds = [containerResult.containerId!]
            lab.primaryContainerId = containerResult.containerId
            lab.status = 'running'
            lab.updatedAt = new Date().toISOString()
          })
        }

        logger.info('从 Dockerfile 创建实验室成功', 'main', {
          containerId: containerResult.containerId.substring(0, 12),
          containerName: dockerName
        })

        return {
          success: true,
          containerId: containerResult.containerId
        }
      } catch (error) {
        const errorMessage = normalizeLabError(error, '从 Dockerfile 创建实验室失败')
        logger.error('从 Dockerfile 创建实验室失败', 'main', { error: errorMessage })
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  ipcMain.handle(
    'lab:createFromCompose',
    async (
      _event,
      content: string,
      options: ComposeOptions | undefined,
      labId: string | undefined,
      labName: string | undefined
    ): Promise<ComposeResult> => {
      try {
        const projectName = sanitizeDockerName(
          labName || options?.projectName || `compose-${Date.now()}`,
          'lab-docker-compose-'
        )

        logger.info('开始从 docker-compose 创建实验室', 'main', {
          projectName,
          labId,
          labName,
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

        if (labId && upResult.containerIds && upResult.containerIds.length > 0) {
          updateLabMetadata(labId, (lab) => {
            lab.containerIds = upResult.containerIds || []
            lab.primaryContainerId = upResult.containerIds?.[0]
            lab.composeProjectName = projectName
            lab.status = 'running'
            lab.updatedAt = new Date().toISOString()
          })
        }

        logger.info('从 docker-compose 创建实验室成功', 'main', {
          projectName,
          containerCount: upResult.containerIds?.length || 0
        })

        return {
          success: true,
          containerIds: upResult.containerIds || [],
          failedServices: []
        }
      } catch (error) {
        const errorMessage = normalizeLabError(error, '从 docker-compose 创建实验室失败')
        logger.error('从 docker-compose 创建实验室失败', 'main', { error: errorMessage })
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
