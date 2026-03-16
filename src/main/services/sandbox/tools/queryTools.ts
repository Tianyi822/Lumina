import { sandboxService } from '../SandboxService'
import { getDockerService } from '../docker/DockerService'
import { MCPToolCallResult } from '@main/types/mcp'
import { ContainerFilter } from '@shared/types/sandbox'
import { ToolArgs, SandboxToolDefinition } from './types'
import { findSandbox } from './toolExecutor'

const dockerService = getDockerService()

/**
 * 列出所有沙箱
 */
export const listSandboxesTool: SandboxToolDefinition = {
  name: 'sandbox__list_sandboxes',
  description: '列出所有沙箱及其状态，包括沙箱名称、ID、运行状态、创建时间和关联容器数量',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  serverName: 'sandbox',
  async execute(): Promise<MCPToolCallResult> {
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
}

/**
 * 获取沙箱详细状态
 */
export const getSandboxStatusTool: SandboxToolDefinition = {
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
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return {
        success: false,
        error: '未找到指定的沙箱'
      }
    }

    // 获取容器状态
    const containerStatuses = await Promise.all(
      (sandbox.containerIds || []).map(async (id) => {
        const details = await dockerService.getContainerDetails(id)
        const stats = await dockerService.getContainerStats(id)
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
}

/**
 * 获取容器日志
 */
export const getContainerLogsTool: SandboxToolDefinition = {
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
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
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
    const logs = await dockerService.getContainerLogs(containerId, { tail })

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
}

/**
 * 列出所有容器
 */
export const listContainersTool: SandboxToolDefinition = {
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
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const state = (args.state as ContainerFilter['state']) || 'all'
    const containers = await dockerService.listContainers({ state })

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
}

export const queryTools = [
  listSandboxesTool,
  getSandboxStatusTool,
  getContainerLogsTool,
  listContainersTool
]
