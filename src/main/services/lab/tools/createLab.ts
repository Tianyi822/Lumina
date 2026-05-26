/**
 * 创建实验室工具
 * 处理实验室的创建逻辑，支持 compose、dockerfile、existing 三种类型
 */

import { labService } from '../LabService'
import { getDockerService } from '../docker/DockerService'
import { logger } from '@main/services/logger'
import type { MCPToolCallResult } from '@main/types/mcp'
import type { CreateLabRequest, LabData, LabCreationType, PortMapping } from '@shared/types/lab'
import type { ToolArgs, LabToolDefinition } from './types'
import { frontendLabService } from '../frontend'
import { parseDockerfileExposedPorts, allocatePortMappings, checkLocalImages } from './utils'

const dockerService = getDockerService()

/**
 * 恢复前端实验室运行时（如果需要）
 */
export async function recoverFrontendLabRuntimeIfNeeded(lab: LabData): Promise<{
  warning?: string
  previewUrl?: string
}> {
  const recoveryResult = await frontendLabService.recoverFrontendRuntime(lab)

  return {
    warning: recoveryResult.warning,
    previewUrl: recoveryResult.previewUrl
  }
}

/**
 * 创建实验室
 */
export const createLabTool: LabToolDefinition = {
  name: 'lab__create_lab',
  description:
    '创建新的实验室环境。支持四种类型：compose（使用 docker-compose 配置）、dockerfile（从 Dockerfile 构建）、existing（关联已有容器）、ssh（连接远程服务器）。创建成功后会返回实验室 ID',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '实验室的名称，建议使用有意义的名称如 "MySQL-Dev"'
      },
      creation_type: {
        type: 'string',
        enum: ['existing', 'compose', 'dockerfile', 'ssh'],
        description:
          '创建类型：compose 使用 docker-compose，dockerfile 从 Dockerfile 构建，existing 关联已有容器，ssh 连接远程服务器。能根据用户需求推断时应直接提供该参数；只有必须让用户选择时才省略'
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
        description: '实验室的详细描述（可选）'
      },
      use_local_image: {
        type: 'string',
        enum: ['yes', 'no', 'pull', 'cancel'],
        description:
          '镜像处理方式：yes 使用本地镜像，no 强制拉取最新镜像，pull 继续拉取（镜像不存在时），cancel 取消操作'
      },
      ssh_host: {
        type: 'string',
        description: 'SSH 远程服务器地址 (creation_type 为 ssh 时必需)'
      },
      ssh_port: {
        type: 'number',
        description: 'SSH 端口号 (creation_type 为 ssh 时使用，默认 22)'
      },
      ssh_username: {
        type: 'string',
        description: 'SSH 用户名 (creation_type 为 ssh 时必需)'
      },
      ssh_auth_type: {
        type: 'string',
        enum: ['password', 'key'],
        description: 'SSH 认证方式 (creation_type 为 ssh 时使用，默认 password)'
      },
      ssh_password: {
        type: 'string',
        description: 'SSH 密码 (creation_type 为 ssh 且 authType 为 password 时使用)'
      },
      ssh_key_name: {
        type: 'string',
        description: 'SSH 密钥名称 (creation_type 为 ssh 且 authType 为 key 时使用)'
      }
    },
    required: ['name']
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const name = args.name as string
    const creationType = args.creation_type as LabCreationType | undefined

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
              question: '请选择实验室创建方式：',
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
                },
                {
                  value: 'ssh',
                  label: 'SSH 远程服务器',
                  description: '连接远程服务器，执行命令和读写文件'
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
    if (creationType === 'ssh') {
      if (!args.ssh_host || !args.ssh_username) {
        return {
          success: false,
          error: 'ssh 类型需要提供 ssh_host 和 ssh_username 参数'
        }
      }
    }

    // 3. 检查本地镜像是否已存在（仅对 dockerfile 和 compose 类型）
    const useLocalImage = args.use_local_image as string | undefined

    logger.debug('实验室创建参数检查', 'main', {
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
                      description: '取消本次实验室创建操作'
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
                      description: '取消本次实验室创建操作'
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
      logger.info('用户取消实验室创建', 'main', { name })
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: '已取消实验室创建操作。'
          }
        ]
      }
    }

    // 5. 创建实验室元数据
    logger.info('开始创建实验室元数据', 'main', { name, creationType, useLocalImage })
    const request: CreateLabRequest = {
      name,
      creationType,
      description: args.description as string
    }
    if (creationType === 'existing') {
      request.existingContainerId = args.existing_container_id as string
    }
    if (creationType === 'ssh') {
      request.sshHost = args.ssh_host as string
      request.sshPort = (args.ssh_port as number) || 22
      request.sshUsername = args.ssh_username as string
      request.sshAuthType = (args.ssh_auth_type as 'password' | 'key') || 'password'
      request.sshPassword = args.ssh_password as string | undefined
      request.sshKeyName = args.ssh_key_name as string | undefined
    }

    const metaResult = await labService.createLab(request)
    if (!metaResult.success || !metaResult.lab) {
      return {
        success: false,
        error: metaResult.error || '创建实验室元数据失败'
      }
    }

    const labId = metaResult.lab.labId

    // 6. 根据类型执行实际容器操作
    try {
      switch (creationType) {
        case 'existing':
          // existing 类型在 labService.createLab 中已处理
          break

        case 'ssh':
          // SSH 类型在 labService.createLab 中已处理，不需要容器操作
          break

        case 'dockerfile': {
          const sanitizedName = name
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, '-')
            .replace(/^-+|-+$/g, '')
          const dockerName = `lab-dockerfile-${sanitizedName}`
          const dockerfileContent = args.dockerfile_content as string

          logger.info('开始构建 Dockerfile 镜像', 'main', {
            labId,
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
            const lab = labService.loadLab(labId)
            if (lab) {
              lab.status = 'error'
              labService.saveLab(lab)
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
              labId,
              portMappings
            })
          }

          logger.info('镜像构建成功，开始创建容器', 'main', {
            labId,
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
            const lab = labService.loadLab(labId)
            if (lab) {
              lab.status = 'error'
              labService.saveLab(lab)
            }
            return {
              success: false,
              error: containerResult.error || '创建容器失败'
            }
          }

          // 更新实验室元数据
          const dockerfileLab = labService.loadLab(labId)
          if (dockerfileLab) {
            dockerfileLab.containerIds = [containerResult.containerId]
            dockerfileLab.primaryContainerId = containerResult.containerId
            dockerfileLab.portMappings = portMappings
            dockerfileLab.status = 'running'
            dockerfileLab.updatedAt = new Date().toISOString()
            labService.saveLab(dockerfileLab)
          }
          break
        }

        case 'compose': {
          const sanitizedName = name
            .toLowerCase()
            .replace(/[^a-z0-9_.-]/g, '-')
            .replace(/^-+|-+$/g, '')
          const projectName = `lab-docker-compose-${sanitizedName}`

          logger.info('开始执行 docker compose up', 'main', {
            labId,
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
            const lab = labService.loadLab(labId)
            if (lab) {
              lab.status = 'error'
              labService.saveLab(lab)
            }
            return {
              success: false,
              error: composeResult.error || 'docker compose up 失败'
            }
          }

          // 更新实验室元数据
          const composeLab = labService.loadLab(labId)
          if (composeLab) {
            composeLab.containerIds = composeResult.containerIds || []
            composeLab.primaryContainerId = composeResult.containerIds?.[0]
            composeLab.composeProjectName = projectName
            composeLab.status = 'running'
            composeLab.updatedAt = new Date().toISOString()
            labService.saveLab(composeLab)
          }
          break
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      logger.error('容器操作失败', 'main', { labId, error: errorMsg })
      const lab = labService.loadLab(labId)
      if (lab) {
        lab.status = 'error'
        labService.saveLab(lab)
      }
      return {
        success: false,
        error: `容器操作失败: ${errorMsg}`
      }
    }

    // 7. 返回成功
    const finalLab = labService.loadLab(labId)

    // 构建端口映射信息
    let portMappingInfo = ''
    if (finalLab?.portMappings && finalLab.portMappings.length > 0) {
      portMappingInfo =
        '\n\n端口映射:\n' +
        finalLab.portMappings
          .map((pm) => `  • ${pm.containerPort}/${pm.protocol} -> 127.0.0.1:${pm.hostPort}`)
          .join('\n')
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `实验室创建成功！\n\n实验室 ID: ${labId}\n名称: ${name}\n类型: ${creationType}\n状态: ${finalLab?.status || 'unknown'}\n容器数: ${finalLab?.containerIds?.length || 0}${portMappingInfo}`
        }
      ]
    }
  }
}
