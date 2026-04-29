import { labService } from '../LabService'
import { getDockerService } from '../docker/DockerService'
import { MCPToolCallResult } from '@main/types/mcp'
import { ContainerFilter } from '@shared/types/lab'
import { ToolArgs, LabToolDefinition } from './types'
import { findLab } from './toolExecutor'

const dockerService = getDockerService()

/**
 * 列出所有实验室
 */
export const listLabsTool: LabToolDefinition = {
  name: 'lab__list_labs',
  description: '列出所有实验室及其状态，包括实验室名称、ID、运行状态、创建时间和关联容器数量',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  serverName: 'lab',
  async execute(): Promise<MCPToolCallResult> {
    const labs = await labService.listLabs()

    const formatted = labs.map((s) => ({
      id: s.labId,
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
          text: `找到 ${formatted.length} 个实验室:\n\n${JSON.stringify(formatted, null, 2)}`
        }
      ]
    }
  }
}

/**
 * 获取实验室详细状态
 */
export const getLabStatusTool: LabToolDefinition = {
  name: 'lab__get_lab_status',
  description:
    '获取指定实验室的详细状态，包括容器状态、端口映射、资源使用等信息。可以通过 lab_id 或 lab_name 指定实验室',
  inputSchema: {
    type: 'object',
    properties: {
      lab_id: {
        type: 'string',
        description: '实验室的唯一标识符（ID）'
      },
      lab_name: {
        type: 'string',
        description: '实验室的名称，支持模糊匹配'
      }
    },
    required: []
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return {
        success: false,
        error: '未找到指定的实验室'
      }
    }

    // 获取容器状态
    const containerStatuses = await Promise.all(
      (lab.containerIds || []).map(async (id) => {
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
      id: lab.labId,
      name: lab.name,
      description: lab.description,
      status: lab.status,
      creation_type: lab.creationType,
      is_orphan: lab.isOrphan,
      created_at: lab.createdAt,
      updated_at: lab.updatedAt,
      containers: containerStatuses
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `实验室状态:\n\n${JSON.stringify(status, null, 2)}`
        }
      ]
    }
  }
}

/**
 * 获取容器日志
 */
export const getContainerLogsTool: LabToolDefinition = {
  name: 'lab__get_container_logs',
  description: '获取指定实验室容器的日志内容，可用于排查问题或查看应用输出',
  inputSchema: {
    type: 'object',
    properties: {
      lab_id: {
        type: 'string',
        description: '实验室的唯一标识符（ID）'
      },
      lab_name: {
        type: 'string',
        description: '实验室的名称，支持模糊匹配'
      },
      tail: {
        type: 'number',
        description: '获取最后多少行日志，默认 100 行',
        default: 100
      }
    },
    required: []
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return {
        success: false,
        error: '未找到指定的实验室'
      }
    }

    const containerId = lab.primaryContainerId || lab.containerIds?.[0]
    if (!containerId) {
      return {
        success: false,
        error: '实验室没有关联的容器'
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
export const listContainersTool: LabToolDefinition = {
  name: 'lab__list_containers',
  description: '列出所有 Docker 容器，包括实验室关联的容器和独立容器',
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
  serverName: 'lab',
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

export const queryTools = [listLabsTool, getLabStatusTool, getContainerLogsTool, listContainersTool]
