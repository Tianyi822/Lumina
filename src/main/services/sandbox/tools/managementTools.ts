import { sandboxService } from '../SandboxService'
import { getDockerService } from '../docker/DockerService'
import { sandboxPermissionService } from '../SandboxPermissionService'
import { logger } from '@main/services/logger'
import { MCPToolCallResult } from '@main/types/mcp'
import {
  CreateSandboxRequest,
  SandboxCreationType,
  DeleteSandboxOptions
} from '@shared/types/sandbox'
import { ToolArgs, SandboxToolDefinition } from './types'
import { findSandbox } from './toolExecutor'

const dockerService = getDockerService()

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

          const buildResult = await dockerService.buildImageFromDockerfile({
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

          const containerResult = await dockerService.createContainerFromImage({
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

          const composeResult = await dockerService.composeUp({
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
