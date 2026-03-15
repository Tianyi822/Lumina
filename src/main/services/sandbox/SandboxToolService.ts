import { sandboxService } from './SandboxService'
import { getDockerService } from './docker/DockerService'
import { sandboxPermissionService } from './SandboxPermissionService'
import { logger } from '@main/services/logger'
import type { MCPTool, MCPToolCallResult } from '@main/types/mcp'
import type {
  SandboxData,
  ContainerFilter,
  CreateSandboxRequest,
  DeleteSandboxOptions,
  ExecCommand,
  SandboxCreationType
} from '@shared/types/sandbox'

/**
 * 工具调用参数
 */
interface ToolArgs {
  [key: string]: unknown
}

/**
 * 沙箱工具服务
 * 将 Docker 沙箱操作封装为 LLM 可调用的 MCP 工具格式
 */
export class SandboxToolService {
  private dockerService = getDockerService()

  /**
   * 获取所有沙箱管理工具定义
   */
  getTools(): MCPTool[] {
    return [
      // 查询类工具（安全，无需确认）
      {
        name: 'sandbox__list_sandboxes',
        description: '列出所有沙箱及其状态，包括沙箱名称、ID、运行状态、创建时间和关联容器数量',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        serverName: 'sandbox'
      },
      {
        name: 'sandbox__get_sandbox_status',
        description:
          '获取指定沙箱的详细状态，包括容器状态、端口映射、资源使用等信息。可以通过 sandbox_id 或 sandbox_name 指定沙箱',
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
        serverName: 'sandbox'
      },
      {
        name: 'sandbox__get_container_logs',
        description: '获取指定沙箱容器的日志内容，可用于排查问题或查看应用输出',
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
            tail: {
              type: 'number',
              description: '获取最后多少行日志，默认 100 行',
              default: 100
            }
          },
          required: []
        },
        serverName: 'sandbox'
      },
      {
        name: 'sandbox__list_containers',
        description: '列出所有 Docker 容器，包括沙箱关联的容器和独立容器',
        inputSchema: {
          type: 'object',
          properties: {
            state: {
              type: 'string',
              enum: ['all', 'running', 'stopped'],
              description: '容器状态过滤，all 表示所有容器，running 仅运行中，stopped 仅已停止',
              default: 'all'
            }
          },
          required: []
        },
        serverName: 'sandbox'
      },

      // 控制类工具（需要确认或权限检查）
      {
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
            }
          },
          required: ['name']
        },
        serverName: 'sandbox'
      },
      {
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
        serverName: 'sandbox'
      },
      {
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
        serverName: 'sandbox'
      },
      {
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
        serverName: 'sandbox'
      },
      {
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
        serverName: 'sandbox'
      },
      {
        name: 'sandbox__exec_command',
        description:
          '在指定沙箱的容器中执行命令，可用于调试、查看数据或管理应用。命令执行有 30 秒超时限制',
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
            command: {
              type: 'string',
              description: '要执行的命令，如 "ls -la" 或 "mysql -e SHOW DATABASES"'
            },
            workdir: {
              type: 'string',
              description: '命令执行的工作目录（可选）'
            },
            timeout: {
              type: 'number',
              description: '命令执行超时时间（秒），默认 30 秒，最大 300 秒',
              default: 30
            }
          },
          required: ['command']
        },
        serverName: 'sandbox'
      },

      // 用户交互工具
      {
        name: 'sandbox__ask_user',
        description: '向用户提问并提供选项，等待用户选择后继续。当需要用户确认或选择时使用此工具',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: '向用户提出的问题'
            },
            options: {
              type: 'array',
              description: '供用户选择的选项列表',
              items: {
                type: 'object',
                properties: {
                  value: {
                    type: 'string',
                    description: '选项的值，将作为用户选择结果返回'
                  },
                  label: {
                    type: 'string',
                    description: '选项显示的标签文本'
                  },
                  description: {
                    type: 'string',
                    description: '选项的详细描述（可选）'
                  }
                },
                required: ['value', 'label']
              }
            }
          },
          required: ['question', 'options']
        },
        serverName: 'sandbox'
      }
    ]
  }

  /**
   * 执行指定工具
   */
  async callTool(name: string, args: ToolArgs): Promise<MCPToolCallResult> {
    logger.info(`执行沙箱工具: ${name}`, 'main', { args })

    try {
      switch (name) {
        // 查询类工具
        case 'sandbox__list_sandboxes':
          return await this.listSandboxes()
        case 'sandbox__get_sandbox_status':
          return await this.getSandboxStatus(args)
        case 'sandbox__get_container_logs':
          return await this.getContainerLogs(args)
        case 'sandbox__list_containers':
          return await this.listContainers(args)

        // 控制类工具
        case 'sandbox__create_sandbox':
          return await this.createSandbox(args)
        case 'sandbox__start_sandbox':
          return await this.startSandbox(args)
        case 'sandbox__stop_sandbox':
          return await this.stopSandbox(args)
        case 'sandbox__restart_sandbox':
          return await this.restartSandbox(args)
        case 'sandbox__delete_sandbox':
          return await this.deleteSandbox(args)
        case 'sandbox__exec_command':
          return await this.execCommand(args)

        // 用户交互工具
        case 'sandbox__ask_user':
          return this.askUser(args)

        default:
          return {
            success: false,
            error: `未知工具: ${name}`
          }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`沙箱工具执行失败: ${name}`, 'main', { error: errorMessage, args })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  // ==================== 查询类工具实现 ====================

  /**
   * 列出所有沙箱
   */
  private async listSandboxes(): Promise<MCPToolCallResult> {
    const sandboxes = await sandboxService.listSandboxs()

    const formatted = sandboxes.map((s) => ({
      id: s.sandboxId,
      name: s.name,
      status: s.status,
      creation_type: s.creationType,
      container_count: s.containerCount,
      is_orphan: s.isOrphan,
      created_at: s.createdAt,
      updated_at: s.updatedAt
    }))

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `找到 ${formatted.length} 个沙箱:\n\n${JSON.stringify(formatted, null, 2)}`
        }
      ]
    }
  }

  /**
   * 获取沙箱详细状态
   */
  private async getSandboxStatus(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await this.findSandbox(args)
    if (!sandbox) {
      return {
        success: false,
        error: '未找到指定的沙箱'
      }
    }

    // 获取容器状态
    const containerStatuses = await Promise.all(
      (sandbox.containerIds || []).map(async (id) => {
        const details = await this.dockerService.getContainerDetails(id)
        const stats = await this.dockerService.getContainerStats(id)
        return {
          id: id.substring(0, 12),
          state: details?.state || 'unknown',
          status: details?.status || 'unknown',
          image: details?.image || 'unknown',
          ports: details?.ports || [],
          cpu_percent: stats?.cpu || 0,
          memory_percent: stats?.memory?.percent || 0
        }
      })
    )

    const status = {
      id: sandbox.sandboxId,
      name: sandbox.name,
      description: sandbox.description,
      status: sandbox.status,
      creation_type: sandbox.creationType,
      is_orphan: sandbox.isOrphan,
      created_at: sandbox.createdAt,
      updated_at: sandbox.updatedAt,
      containers: containerStatuses
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `沙箱状态:\n\n${JSON.stringify(status, null, 2)}`
        }
      ]
    }
  }

  /**
   * 获取容器日志
   */
  private async getContainerLogs(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await this.findSandbox(args)
    if (!sandbox) {
      return {
        success: false,
        error: '未找到指定的沙箱'
      }
    }

    const containerId = sandbox.primaryContainerId || sandbox.containerIds?.[0]
    if (!containerId) {
      return {
        success: false,
        error: '沙箱没有关联的容器'
      }
    }

    const tail = typeof args.tail === 'number' ? args.tail : 100
    const logs = await this.dockerService.getContainerLogs(containerId, { tail })

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: logs || '（无日志内容）'
        }
      ]
    }
  }

  /**
   * 列出所有容器
   */
  private async listContainers(args: ToolArgs): Promise<MCPToolCallResult> {
    const state = (args.state as ContainerFilter['state']) || 'all'
    const containers = await this.dockerService.listContainers({ state })

    const formatted = containers.map((c) => ({
      id: c.shortId,
      name: c.names[0] || 'unnamed',
      image: c.image,
      state: c.state,
      status: c.status,
      ports: c.ports
    }))

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `找到 ${formatted.length} 个容器:\n\n${JSON.stringify(formatted, null, 2)}`
        }
      ]
    }
  }

  // ==================== 控制类工具实现 ====================

  /**
   * 创建沙箱
   * 支持三种创建类型：existing、compose、dockerfile
   * 当缺少 creation_type 时，返回选项请求信号
   */
  private async createSandbox(args: ToolArgs): Promise<MCPToolCallResult> {
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

    // 3. 创建沙箱元数据
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

    // 4. 根据类型执行实际容器操作
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

          logger.info('开始构建 Dockerfile 镜像', 'main', { sandboxId, dockerName })

          const buildResult = await this.dockerService.buildImageFromDockerfile({
            dockerfile: args.dockerfile_content as string,
            tag: dockerName
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

          logger.info('镜像构建成功，开始创建容器', 'main', {
            sandboxId,
            imageId: buildResult.imageId
          })

          const containerResult = await this.dockerService.createContainerFromImage({
            imageId: buildResult.imageId,
            name: dockerName
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

          logger.info('开始执行 docker compose up', 'main', { sandboxId, projectName })

          const composeResult = await this.dockerService.composeUp({
            composeContent: args.compose_content as string,
            projectName
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

    // 5. 返回成功
    const finalSandbox = sandboxService.loadSandbox(sandboxId)
    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `沙箱创建成功！\n\n沙箱 ID: ${sandboxId}\n名称: ${name}\n类型: ${creationType}\n状态: ${finalSandbox?.status || 'unknown'}\n容器数: ${finalSandbox?.containerIds?.length || 0}`
        }
      ]
    }
  }

  /**
   * 启动沙箱
   */
  private async startSandbox(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await this.findSandbox(args)
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
        const result = await this.dockerService.startContainer(id)
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

      return {
        success: true,
        content: [
          {
            type: 'text',
            text: `沙箱 "${sandbox.name}" 启动成功！\n已启动 ${results.length} 个容器。`
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

  /**
   * 停止沙箱
   */
  private async stopSandbox(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await this.findSandbox(args)
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
        const result = await this.dockerService.stopContainer(id, timeout)
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

  /**
   * 重启沙箱
   */
  private async restartSandbox(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await this.findSandbox(args)
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
        const result = await this.dockerService.restartContainer(id)
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

      return {
        success: true,
        content: [
          {
            type: 'text',
            text: `沙箱 "${sandbox.name}" 重启成功！\n已重启 ${results.length} 个容器。`
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

  /**
   * 删除沙箱
   */
  private async deleteSandbox(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await this.findSandbox(args)
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

  /**
   * 在容器中执行命令
   */
  private async execCommand(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await this.findSandbox(args)
    if (!sandbox) {
      return {
        success: false,
        error: '未找到指定的沙箱'
      }
    }

    const command = args.command as string
    if (!command) {
      return {
        success: false,
        error: '缺少必需参数: command'
      }
    }

    // 命令安全检查
    if (this.isDangerousCommand(command)) {
      return {
        success: false,
        error: '命令包含危险操作，已被拦截。高风险命令需要用户手动在终端中执行。'
      }
    }

    const containerId = sandbox.primaryContainerId || sandbox.containerIds?.[0]
    if (!containerId) {
      return {
        success: false,
        error: '沙箱没有关联的容器'
      }
    }

    // 检查容器是否运行
    const details = await this.dockerService.getContainerDetails(containerId)
    if (details?.state !== 'running') {
      return {
        success: false,
        error: '容器未运行，请先启动沙箱'
      }
    }

    const timeout = typeof args.timeout === 'number' ? Math.min(args.timeout, 300) : 30

    const execCmd: ExecCommand = {
      command,
      workdir: args.workdir as string,
      timeout
    }

    const result = await this.dockerService.execCommand(containerId, execCmd)

    if (!result) {
      return {
        success: false,
        error: '命令执行失败'
      }
    }

    const output = result.stdout || result.stderr || '（无输出）'
    const exitInfo = result.exitCode === 0 ? '' : `\n（退出码: ${result.exitCode}）`

    return {
      success: result.exitCode === 0,
      content: [
        {
          type: 'text',
          text: `命令执行结果:${exitInfo}\n\n\`\`\`\n${output}\n\`\`\``
        }
      ]
    }
  }

  // ==================== 用户交互工具实现 ====================

  /**
   * 向用户提问并等待选择
   * 返回特殊信号，ChatService 检测后会暂停 ReAct 循环并显示选项
   */
  private askUser(args: ToolArgs): MCPToolCallResult {
    const question = args.question as string
    const options = args.options as Array<{ value: string; label: string; description?: string }>

    if (!question) {
      return {
        success: false,
        error: '缺少必需参数: question'
      }
    }

    if (!options || !Array.isArray(options) || options.length === 0) {
      return {
        success: false,
        error: '缺少必需参数: options（至少需要一个选项）'
      }
    }

    // 返回用户交互请求信号
    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            user_interaction_required: true,
            question,
            options
          })
        }
      ]
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 查找沙箱（支持 ID 或名称模糊匹配）
   */
  private async findSandbox(args: {
    sandbox_id?: string
    sandbox_name?: string
  }): Promise<SandboxData | null> {
    // 优先使用 ID 查找
    if (args.sandbox_id) {
      return sandboxService.loadSandbox(args.sandbox_id)
    }

    // 使用名称模糊匹配
    if (args.sandbox_name) {
      const allSandboxes = await sandboxService.listSandboxs()
      const searchName = args.sandbox_name.toLowerCase()

      // 首先尝试精确匹配
      let match = allSandboxes.find((s) => s.name.toLowerCase() === searchName)

      // 然后尝试包含匹配
      if (!match) {
        match = allSandboxes.find((s) => s.name.toLowerCase().includes(searchName))
      }

      // 最后尝试部分匹配（每个词）
      if (!match) {
        const searchWords = searchName.split(/\s+/)
        match = allSandboxes.find((s) => {
          const sandboxName = s.name.toLowerCase()
          return searchWords.some((word) => sandboxName.includes(word))
        })
      }

      if (match) {
        return sandboxService.loadSandbox(match.sandboxId)
      }
    }

    return null
  }

  /**
   * 检查命令是否包含危险操作
   */
  private isDangerousCommand(command: string): boolean {
    const dangerousPatterns = [
      /rm\s+-rf\s+\//, // rm -rf /
      /mkfs\./, // 格式化文件系统
      /dd\s+if=.*of=\/dev/, // dd 写入设备
      />\s*\/dev\/null/, // 重定向到 null
      /:\(\)\{\s*:\|:&\s*\};/, // Fork bomb
      /curl.*\|.*sh/, // curl 管道到 shell
      /wget.*\|.*sh/ // wget 管道到 shell
    ]

    return dangerousPatterns.some((pattern) => pattern.test(command))
  }
}

/**
 * 沙箱工具服务单例
 */
export const sandboxToolService = new SandboxToolService()
