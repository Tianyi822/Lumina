import { sandboxService } from '../SandboxService'
import { getDockerService } from '../docker/DockerService'
import { sandboxPermissionService } from '../SandboxPermissionService'
import { logger } from '@main/services/logger'
import { MCPToolCallResult } from '@main/types/mcp'
import {
  CreateSandboxRequest,
  SandboxData,
  SandboxCreationType,
  DeleteSandboxOptions,
  PortMapping
} from '@shared/types/sandbox'
import { ToolArgs, SandboxToolDefinition } from './types'
import { findSandbox } from './toolExecutor'
import { frontendSandboxService } from '../frontend'

const dockerService = getDockerService()

/**
 * 端口分配基础偏移量
 * 宿主机端口 = 容器端口 + HOST_PORT_BASE
 * 例如：容器端口 3306 -> 宿主机端口 33306
 */
const HOST_PORT_BASE = 30000

/**
 * 从 Dockerfile 内容中解析基础镜像
 * @param dockerfileContent Dockerfile 内容
 * @returns 基础镜像列表（可能有多个 FROM 语句）
 */
function parseDockerfileImages(dockerfileContent: string): string[] {
  const images: string[] = []
  const lines = dockerfileContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // 匹配 FROM 语句，支持 FROM image:tag 和 FROM image:tag AS name 格式
    const match = trimmed.match(/^FROM\s+([^\s]+)(?:\s+AS\s+\S+)?/i)
    if (match && match[1]) {
      const image = match[1]
      // 排除 scratch 和构建阶段引用（以 --from= 开头的）
      if (image.toLowerCase() !== 'scratch' && !image.startsWith('$')) {
        images.push(image)
      }
    }
  }

  return images
}

/**
 * 从 docker-compose.yaml 内容中解析镜像
 * @param composeContent docker-compose.yaml 内容
 * @returns 镜像列表
 */
function parseComposeImages(composeContent: string): string[] {
  const images: string[] = []
  const lines = composeContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // 匹配 image: xxx 格式
    const match = trimmed.match(/^image:\s*["']?([^"'\s]+)["']?/i)
    if (match && match[1]) {
      images.push(match[1])
    }
  }

  return images
}

/**
 * 从 Dockerfile 内容中解析 EXPOSE 指令暴露的端口
 * @param dockerfileContent Dockerfile 内容
 * @returns 端口列表
 */
function parseDockerfileExposedPorts(
  dockerfileContent: string
): Array<{ containerPort: number; protocol: 'tcp' | 'udp' }> {
  const ports: Array<{ containerPort: number; protocol: 'tcp' | 'udp' }> = []
  const lines = dockerfileContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // 匹配 EXPOSE 指令（忽略大小写）
    if (trimmed.toUpperCase().startsWith('EXPOSE')) {
      const exposeContent = trimmed.slice(6).trim()
      // 支持多种格式: EXPOSE 3306, EXPOSE 3306/tcp, EXPOSE 3306 3307
      const portStrings = exposeContent.split(/\s+/)

      for (const portStr of portStrings) {
        const match = portStr.match(/^(\d+)(?:\/(tcp|udp))?$/i)
        if (match) {
          const containerPort = parseInt(match[1], 10)
          if (containerPort >= 1 && containerPort <= 65535) {
            ports.push({
              containerPort,
              protocol: (match[2]?.toLowerCase() as 'tcp' | 'udp') || 'tcp'
            })
          }
        }
      }
    }
  }

  return ports
}

/**
 * 计算首选宿主机端口
 * 将容器端口映射到稳定高位端口，避免与本机常见开发端口冲突
 */
function getPreferredHostPort(containerPort: number): number {
  const preferredHostPort = containerPort + HOST_PORT_BASE
  if (preferredHostPort <= 65535) {
    return preferredHostPort
  }
  return Math.min(Math.max(containerPort, 1024), 65535)
}

/**
 * 检查宿主机端口是否可用
 */
async function isHostPortAvailable(port: number): Promise<boolean> {
  const net = await import('node:net')

  return new Promise((resolve) => {
    const server = net.createServer()

    const finish = (available: boolean): void => {
      server.removeAllListeners()
      resolve(available)
    }

    server.once('error', () => finish(false))
    server.once('listening', () => {
      server.close(() => finish(true))
    })
    server.listen(port, '0.0.0.0')
  })
}

/**
 * 分配固定宿主机端口，避免端口冲突
 * @param preferredPort 首选端口
 * @returns 可用的宿主机端口
 */
async function allocateFixedHostPort(preferredPort: number): Promise<number> {
  // 收集所有已有沙箱的端口映射
  const reservedPorts = new Set<number>()

  const allSandboxes = sandboxService.loadAllSandboxes()
  for (const sandbox of allSandboxes) {
    // 收集前端沙箱的端口
    if (sandbox.frontend?.hostPort) {
      reservedPorts.add(sandbox.frontend.hostPort)
    }
    // 收集通用端口映射
    if (sandbox.portMappings) {
      for (const mapping of sandbox.portMappings) {
        if (mapping.hostPort) {
          reservedPorts.add(mapping.hostPort)
        }
      }
    }
  }

  // 从首选端口开始逐一检测
  for (let port = preferredPort; port <= 65535; port += 1) {
    if (reservedPorts.has(port)) {
      continue
    }

    if (await isHostPortAvailable(port)) {
      return port
    }
  }

  throw new Error('未找到可用的宿主机端口')
}

/**
 * 为端口列表分配固定宿主机端口
 */
async function allocatePortMappings(
  ports: Array<{ containerPort: number; protocol: 'tcp' | 'udp' }>
): Promise<PortMapping[]> {
  const portMappings: PortMapping[] = []

  for (const port of ports) {
    const preferredPort = getPreferredHostPort(port.containerPort)
    const hostPort = await allocateFixedHostPort(preferredPort)

    portMappings.push({
      hostPort,
      containerPort: port.containerPort,
      protocol: port.protocol
    })

    logger.info('分配端口映射', 'main', {
      containerPort: port.containerPort,
      hostPort,
      protocol: port.protocol
    })
  }

  return portMappings
}

/**
 * 检查沙箱创建所需的镜像是否已存在于本地
 * @param creationType 创建类型
 * @param dockerfileContent Dockerfile 内容
 * @param composeContent docker-compose.yaml 内容
 * @returns 存在的镜像列表和所有需要的镜像列表
 */
async function checkLocalImages(
  creationType: SandboxCreationType,
  dockerfileContent?: string,
  composeContent?: string
): Promise<{ existingImages: string[]; requiredImages: string[] }> {
  let requiredImages: string[] = []

  if (creationType === 'dockerfile' && dockerfileContent) {
    requiredImages = parseDockerfileImages(dockerfileContent)
  } else if (creationType === 'compose' && composeContent) {
    requiredImages = parseComposeImages(composeContent)
  }

  if (requiredImages.length === 0) {
    return { existingImages: [], requiredImages: [] }
  }

  const existingImages = await dockerService.checkImagesExist(requiredImages)
  return { existingImages, requiredImages }
}

async function recoverFrontendSandboxRuntimeIfNeeded(sandbox: SandboxData): Promise<{
  warning?: string
  previewUrl?: string
}> {
  const recoveryResult = await frontendSandboxService.recoverFrontendRuntime(sandbox)

  return {
    warning: recoveryResult.warning,
    previewUrl: recoveryResult.previewUrl
  }
}

/**
 * 创建沙箱
 */
export const createSandboxTool: SandboxToolDefinition = {
  name: 'sandbox__create_sandbox',
  description:
    '创建新的沙箱环境。支持三种类型：compose（使用 docker-compose 配置）、dockerfile（从 Dockerfile 构建）、existing（关联已有容器）。创建成功后会返回沙箱 ID',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '沙箱的名称，建议使用有意义的名称如 "MySQL-Dev"'
      },
      creation_type: {
        type: 'string',
        enum: ['existing', 'compose', 'dockerfile'],
        description:
          '创建类型：compose 使用 docker-compose，dockerfile 从 Dockerfile 构建，existing 关联已有容器'
      },
      compose_content: {
        type: 'string',
        description: 'docker-compose.yaml 文件内容（creation_type 为 compose 时必需）'
      },
      dockerfile_content: {
        type: 'string',
        description: 'Dockerfile 内容（creation_type 为 dockerfile 时必需）'
      },
      existing_container_id: {
        type: 'string',
        description: '已有容器的 ID（creation_type 为 existing 时必需）'
      },
      description: {
        type: 'string',
        description: '沙箱的详细描述（可选）'
      },
      use_local_image: {
        type: 'string',
        enum: ['yes', 'no', 'pull', 'cancel'],
        description:
          '镜像处理方式：yes 使用本地镜像，no 强制拉取最新镜像，pull 继续拉取（镜像不存在时），cancel 取消操作'
      }
    },
    required: ['name']
  },
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const name = args.name as string
    const creationType = args.creation_type as SandboxCreationType | undefined

    if (!name) {
      return {
        success: false,
        error: '缺少必需参数: name'
      }
    }

    // 1. 缺少 creation_type → 返回用户交互请求信号
    if (!creationType) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              user_interaction_required: true,
              question: '请选择沙箱创建方式：',
              options: [
                {
                  value: 'existing',
                  label: '已有容器关联',
                  description: '关联一个已运行的 Docker 容器'
                },
                {
                  value: 'dockerfile',
                  label: 'Dockerfile 构建',
                  description: '从 Dockerfile 构建新容器'
                },
                {
                  value: 'compose',
                  label: 'Docker Compose 编排',
                  description: '使用 docker-compose 创建容器组'
                }
              ]
            })
          }
        ]
      }
    }

    // 2. 类型特定参数验证
    if (creationType === 'existing' && !args.existing_container_id) {
      return {
        success: false,
        error: 'existing 类型需要提供 existing_container_id 参数'
      }
    }
    if (creationType === 'dockerfile' && !args.dockerfile_content) {
      return {
        success: false,
        error: 'dockerfile 类型需要提供 dockerfile_content 参数'
      }
    }
    if (creationType === 'compose' && !args.compose_content) {
      return {
        success: false,
        error: 'compose 类型需要提供 compose_content 参数'
      }
    }

    // 3. 检查本地镜像是否已存在（仅对 dockerfile 和 compose 类型）
    const useLocalImage = args.use_local_image as string | undefined

    logger.debug('沙箱创建参数检查', 'main', {
      name,
      creationType,
      useLocalImage,
      hasDockerfile: !!args.dockerfile_content,
      hasCompose: !!args.compose_content
    })

    if (creationType !== 'existing' && !useLocalImage) {
      const { existingImages, requiredImages } = await checkLocalImages(
        creationType,
        args.dockerfile_content as string | undefined,
        args.compose_content as string | undefined
      )

      // 无论镜像是否存在，都需要提示用户确认
      if (requiredImages.length > 0) {
        if (existingImages.length > 0) {
          // 镜像已存在，询问是否使用本地镜像
          logger.info('检测到本地已存在所需镜像', 'main', {
            existingImages,
            requiredImages
          })

          return {
            success: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  user_interaction_required: true,
                  question: `检测到本地已存在以下镜像：\n${existingImages.map((img) => `• ${img}`).join('\n')}\n\n是否使用本地镜像？`,
                  options: [
                    {
                      value: 'yes',
                      label: '使用本地镜像',
                      description: '直接使用本地已有的镜像，跳过拉取步骤（速度更快）'
                    },
                    {
                      value: 'no',
                      label: '拉取最新镜像',
                      description: '强制从远程仓库拉取最新版本的镜像'
                    },
                    {
                      value: 'cancel',
                      label: '取消操作',
                      description: '取消本次沙箱创建操作'
                    }
                  ]
                })
              }
            ]
          }
        } else {
          // 镜像不存在，询问是否继续拉取
          logger.info('需要拉取镜像', 'main', {
            requiredImages
          })

          return {
            success: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  user_interaction_required: true,
                  question: `需要从远程仓库拉取以下镜像：\n${requiredImages.map((img) => `• ${img}`).join('\n')}\n\n拉取镜像可能需要较长时间，是否继续？`,
                  options: [
                    {
                      value: 'pull',
                      label: '继续拉取',
                      description: '从远程仓库拉取镜像（根据网络情况可能需要几分钟）'
                    },
                    {
                      value: 'cancel',
                      label: '取消操作',
                      description: '取消本次沙箱创建操作'
                    }
                  ]
                })
              }
            ]
          }
        }
      }
    } else if (creationType !== 'existing' && useLocalImage) {
      // 用户已经做出选择，跳过镜像检查，继续执行创建
      logger.info('用户已选择镜像处理方式，继续执行创建', 'main', {
        useLocalImage,
        creationType
      })
    }

    // 4. 处理用户选择取消操作
    if (useLocalImage === 'cancel') {
      logger.info('用户取消沙箱创建', 'main', { name })
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: '已取消沙箱创建操作。'
          }
        ]
      }
    }

    // 5. 创建沙箱元数据
    logger.info('开始创建沙箱元数据', 'main', { name, creationType, useLocalImage })
    const request: CreateSandboxRequest = {
      name,
      creationType,
      description: args.description as string
    }
    if (creationType === 'existing') {
      request.existingContainerId = args.existing_container_id as string
    }

    const metaResult = await sandboxService.createSandbox(request)
    if (!metaResult.success || !metaResult.sandbox) {
      return {
        success: false,
        error: metaResult.error || '创建沙箱元数据失败'
      }
    }

    const sandboxId = metaResult.sandbox.sandboxId

    // 6. 根据类型执行实际容器操作
    try {
      switch (creationType) {
        case 'existing':
          // existing 类型在 sandboxService.createSandbox 中已处理
          break

        case 'dockerfile': {
          const sanitizedName = name
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, '-')
            .replace(/^-+|-+$/g, '')
          const dockerName = `sandbox-dockerfile-${sanitizedName}`
          const dockerfileContent = args.dockerfile_content as string

          logger.info('开始构建 Dockerfile 镜像', 'main', {
            sandboxId,
            dockerName,
            useLocalImage: useLocalImage || 'not-specified'
          })

          // 构建镜像时传入是否使用本地缓存的选项
          const buildResult = await dockerService.buildImageFromDockerfile({
            dockerfile: dockerfileContent,
            tag: dockerName,
            // 当用户选择使用本地镜像时，不拉取新的基础镜像
            noPull: useLocalImage === 'yes'
          })
          if (!buildResult.success || !buildResult.imageId) {
            const sandbox = sandboxService.loadSandbox(sandboxId)
            if (sandbox) {
              sandbox.status = 'error'
              sandboxService.saveSandbox(sandbox)
            }
            return {
              success: false,
              error: buildResult.error || '构建镜像失败'
            }
          }

          // 解析 Dockerfile 中的 EXPOSE 指令获取端口
          let exposedPorts = parseDockerfileExposedPorts(dockerfileContent)

          // 如果 Dockerfile 中没有 EXPOSE 指令，尝试从镜像元数据获取
          if (exposedPorts.length === 0) {
            try {
              const imageInspect = await dockerService.inspectImage(buildResult.imageId)
              if (imageInspect?.Config?.ExposedPorts) {
                exposedPorts = Object.keys(imageInspect.Config.ExposedPorts).map((port) => {
                  const [portNum, protocol] = port.split('/')
                  return {
                    containerPort: parseInt(portNum, 10),
                    protocol: (protocol as 'tcp' | 'udp') || 'tcp'
                  }
                })
                logger.info('从镜像元数据获取到暴露端口', 'main', { exposedPorts })
              }
            } catch (error) {
              logger.warn('获取镜像暴露端口失败', 'main', {
                error: error instanceof Error ? error.message : String(error)
              })
            }
          }

          // 为每个暴露端口分配固定宿主机端口
          let portMappings: PortMapping[] = []
          if (exposedPorts.length > 0) {
            portMappings = await allocatePortMappings(exposedPorts)
            logger.info('端口映射分配完成', 'main', {
              sandboxId,
              portMappings
            })
          }

          logger.info('镜像构建成功，开始创建容器', 'main', {
            sandboxId,
            imageId: buildResult.imageId,
            portMappings
          })

          const containerResult = await dockerService.createContainerFromImage({
            imageId: buildResult.imageId,
            name: dockerName,
            ports: portMappings.map((pm) => ({
              containerPort: pm.containerPort,
              hostPort: pm.hostPort,
              protocol: pm.protocol
            }))
          })
          if (!containerResult.success || !containerResult.containerId) {
            const sandbox = sandboxService.loadSandbox(sandboxId)
            if (sandbox) {
              sandbox.status = 'error'
              sandboxService.saveSandbox(sandbox)
            }
            return {
              success: false,
              error: containerResult.error || '创建容器失败'
            }
          }

          // 更新沙箱元数据
          const dockerfileSandbox = sandboxService.loadSandbox(sandboxId)
          if (dockerfileSandbox) {
            dockerfileSandbox.containerIds = [containerResult.containerId]
            dockerfileSandbox.primaryContainerId = containerResult.containerId
            dockerfileSandbox.portMappings = portMappings
            dockerfileSandbox.status = 'running'
            dockerfileSandbox.updatedAt = new Date().toISOString()
            sandboxService.saveSandbox(dockerfileSandbox)
          }
          break
        }

        case 'compose': {
          const sanitizedName = name
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, '-')
            .replace(/^-+|-+$/g, '')
          const projectName = `sandbox-docker-compose-${sanitizedName}`

          logger.info('开始执行 docker compose up', 'main', {
            sandboxId,
            projectName,
            useLocalImage: useLocalImage || 'not-specified'
          })

          const composeResult = await dockerService.composeUp({
            composeContent: args.compose_content as string,
            projectName,
            // 当用户选择使用本地镜像时，不拉取新的镜像
            noPull: useLocalImage === 'yes'
          })
          if (!composeResult.success) {
            const sandbox = sandboxService.loadSandbox(sandboxId)
            if (sandbox) {
              sandbox.status = 'error'
              sandboxService.saveSandbox(sandbox)
            }
            return {
              success: false,
              error: composeResult.error || 'docker compose up 失败'
            }
          }

          // 更新沙箱元数据
          const composeSandbox = sandboxService.loadSandbox(sandboxId)
          if (composeSandbox) {
            composeSandbox.containerIds = composeResult.containerIds || []
            composeSandbox.primaryContainerId = composeResult.containerIds?.[0]
            composeSandbox.composeProjectName = projectName
            composeSandbox.status = 'running'
            composeSandbox.updatedAt = new Date().toISOString()
            sandboxService.saveSandbox(composeSandbox)
          }
          break
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('容器操作失败', 'main', { sandboxId, error: errorMsg })
      const sandbox = sandboxService.loadSandbox(sandboxId)
      if (sandbox) {
        sandbox.status = 'error'
        sandboxService.saveSandbox(sandbox)
      }
      return {
        success: false,
        error: `容器操作失败: ${errorMsg}`
      }
    }

    // 7. 返回成功
    const finalSandbox = sandboxService.loadSandbox(sandboxId)

    // 构建端口映射信息
    let portMappingInfo = ''
    if (finalSandbox?.portMappings && finalSandbox.portMappings.length > 0) {
      portMappingInfo = '\n\n端口映射:\n' + finalSandbox.portMappings
        .map(
          (pm) =>
            `  • ${pm.containerPort}/${pm.protocol} -> 127.0.0.1:${pm.hostPort}`
        )
        .join('\n')
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `沙箱创建成功！\n\n沙箱 ID: ${sandboxId}\n名称: ${name}\n类型: ${creationType}\n状态: ${finalSandbox?.status || 'unknown'}\n容器数: ${finalSandbox?.containerIds?.length || 0}${portMappingInfo}`
        }
      ]
    }
  }
}

/**
 * 启动沙箱
 */
export const startSandboxTool: SandboxToolDefinition = {
  name: 'sandbox__start_sandbox',
  description: '启动已停止的沙箱，启动后容器将开始运行',
  inputSchema: {
    type: 'object',
    properties: {
      sandbox_id: {
        type: 'string',
        description: '沙箱的唯一标识符（ID）'
      },
      sandbox_name: {
        type: 'string',
        description: '沙箱的名称，支持模糊匹配'
      }
    },
    required: []
  },
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return {
        success: false,
        error: '未找到指定的沙箱'
      }
    }

    // 权限检查
    if (!sandboxPermissionService.canStart(sandbox.creationType)) {
      return {
        success: false,
        error: `类型为 "${sandbox.creationType}" 的沙箱不允许启动操作`
      }
    }

    // 启动所有关联容器
    const results = await Promise.all(
      (sandbox.containerIds || []).map(async (id) => {
        const result = await dockerService.startContainer(id)
        return { id: id.substring(0, 12), success: result.success, error: result.error }
      })
    )

    const allSuccess = results.every((r) => r.success)
    const failed = results.filter((r) => !r.success)

    if (allSuccess) {
      // 更新沙箱状态
      sandbox.status = 'running'
      sandbox.updatedAt = new Date().toISOString()
      await sandboxService.saveSandbox(sandbox)

      const frontendRecovery = await recoverFrontendSandboxRuntimeIfNeeded(sandbox)
      let message = `沙箱 "${sandbox.name}" 启动成功！\n已启动 ${results.length} 个容器。`
      if (frontendRecovery.warning) {
        message += `\n\n⚠️ ${frontendRecovery.warning}`
      } else if (sandbox.frontend && frontendRecovery.previewUrl) {
        message += `\n\n前端服务已恢复，预览地址: ${frontendRecovery.previewUrl}`
      }

      return {
        success: true,
        content: [
          {
            type: 'text',
            text: message
          }
        ]
      }
    } else {
      return {
        success: false,
        error: `部分容器启动失败: ${failed.map((f) => `${f.id} (${f.error})`).join(', ')}`
      }
    }
  }
}

/**
 * 停止沙箱
 */
export const stopSandboxTool: SandboxToolDefinition = {
  name: 'sandbox__stop_sandbox',
  description: '停止运行中的沙箱，停止后容器将不再运行但数据会保留',
  inputSchema: {
    type: 'object',
    properties: {
      sandbox_id: {
        type: 'string',
        description: '沙箱的唯一标识符（ID）'
      },
      sandbox_name: {
        type: 'string',
        description: '沙箱的名称，支持模糊匹配'
      },
      timeout: {
        type: 'number',
        description: '停止超时时间（秒），默认 10 秒',
        default: 10
      }
    },
    required: []
  },
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return {
        success: false,
        error: '未找到指定的沙箱'
      }
    }

    // 权限检查
    if (!sandboxPermissionService.canStop(sandbox.creationType)) {
      return {
        success: false,
        error: `类型为 "${sandbox.creationType}" 的沙箱不允许停止操作`
      }
    }

    const timeout = typeof args.timeout === 'number' ? args.timeout : 10

    // 停止所有关联容器
    const results = await Promise.all(
      (sandbox.containerIds || []).map(async (id) => {
        const result = await dockerService.stopContainer(id, timeout)
        return { id: id.substring(0, 12), success: result.success, error: result.error }
      })
    )

    const allSuccess = results.every((r) => r.success)
    const failed = results.filter((r) => !r.success)

    if (allSuccess) {
      // 更新沙箱状态
      sandbox.status = 'stopped'
      sandbox.updatedAt = new Date().toISOString()
      await sandboxService.saveSandbox(sandbox)

      return {
        success: true,
        content: [
          {
            type: 'text',
            text: `沙箱 "${sandbox.name}" 已停止。\n已停止 ${results.length} 个容器。`
          }
        ]
      }
    } else {
      return {
        success: false,
        error: `部分容器停止失败: ${failed.map((f) => `${f.id} (${f.error})`).join(', ')}`
      }
    }
  }
}

/**
 * 重启沙箱
 */
export const restartSandboxTool: SandboxToolDefinition = {
  name: 'sandbox__restart_sandbox',
  description: '重启沙箱，相当于先停止再启动',
  inputSchema: {
    type: 'object',
    properties: {
      sandbox_id: {
        type: 'string',
        description: '沙箱的唯一标识符（ID）'
      },
      sandbox_name: {
        type: 'string',
        description: '沙箱的名称，支持模糊匹配'
      }
    },
    required: []
  },
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return {
        success: false,
        error: '未找到指定的沙箱'
      }
    }

    // 权限检查
    if (!sandboxPermissionService.canRestart(sandbox.creationType)) {
      return {
        success: false,
        error: `类型为 "${sandbox.creationType}" 的沙箱不允许重启操作`
      }
    }

    // 重启所有关联容器
    const results = await Promise.all(
      (sandbox.containerIds || []).map(async (id) => {
        const result = await dockerService.restartContainer(id)
        return { id: id.substring(0, 12), success: result.success, error: result.error }
      })
    )

    const allSuccess = results.every((r) => r.success)
    const failed = results.filter((r) => !r.success)

    if (allSuccess) {
      // 更新沙箱状态
      sandbox.status = 'running'
      sandbox.updatedAt = new Date().toISOString()
      await sandboxService.saveSandbox(sandbox)

      const frontendRecovery = await recoverFrontendSandboxRuntimeIfNeeded(sandbox)

      let message = `沙箱 "${sandbox.name}" 重启成功！\n已重启 ${results.length} 个容器。`
      if (frontendRecovery.warning) {
        message += `\n\n⚠️ ${frontendRecovery.warning}`
      } else if (sandbox.frontend && frontendRecovery.previewUrl) {
        message += `\n\n前端服务已恢复，预览地址: ${frontendRecovery.previewUrl}`
      }

      return {
        success: true,
        content: [
          {
            type: 'text',
            text: message
          }
        ]
      }
    } else {
      return {
        success: false,
        error: `部分容器重启失败: ${failed.map((f) => `${f.id} (${f.error})`).join(', ')}`
      }
    }
  }
}

/**
 * 删除沙箱
 */
export const deleteSandboxTool: SandboxToolDefinition = {
  name: 'sandbox__delete_sandbox',
  description:
    '删除沙箱。注意：此操作会删除沙箱元数据，可选择是否同时删除关联的容器和数据。删除后不可恢复，请谨慎操作',
  inputSchema: {
    type: 'object',
    properties: {
      sandbox_id: {
        type: 'string',
        description: '沙箱的唯一标识符（ID）'
      },
      sandbox_name: {
        type: 'string',
        description: '沙箱的名称，支持模糊匹配'
      },
      delete_containers: {
        type: 'boolean',
        description: '是否同时删除关联的容器，默认为 true',
        default: true
      },
      force: {
        type: 'boolean',
        description: '是否强制删除运行中的容器，默认为 false',
        default: false
      }
    },
    required: []
  },
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return {
        success: false,
        error: '未找到指定的沙箱'
      }
    }

    const deleteContainers = args.delete_containers !== false // 默认 true
    const force = args.force === true // 默认 false

    const options: DeleteSandboxOptions = {
      deleteContainers,
      force
    }

    const result = await sandboxService.deleteSandbox(sandbox.sandboxId, options)

    if (result.success) {
      const msg = deleteContainers
        ? `沙箱 "${sandbox.name}" 及其关联容器已删除。`
        : `沙箱 "${sandbox.name}" 已删除（关联容器保留）。`

      return {
        success: true,
        content: [
          {
            type: 'text',
            text: msg
          }
        ]
      }
    } else {
      return {
        success: false,
        error: result.error || '删除沙箱失败'
      }
    }
  }
}

export const managementTools = [
  createSandboxTool,
  startSandboxTool,
  stopSandboxTool,
  restartSandboxTool,
  deleteSandboxTool
]
