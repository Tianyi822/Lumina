import { MCPToolCallResult } from '@main/types/mcp'
import type { FrontendFramework } from '@shared/types/lab'
import { frontendLabService } from '../frontend'
import { findLab } from './toolExecutor'
import { ToolArgs, LabToolDefinition } from './types'

/**
 * 创建前端实验室
 */
export const createFrontendLabTool: LabToolDefinition = {
  name: 'lab__create_frontend_lab',
  description: '创建一个用于运行前端项目的实验室容器，并返回预览 URL',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '实验室名称' },
      framework: {
        type: 'string',
        enum: ['vue', 'react', 'vanilla'],
        description: '前端框架类型'
      },
      container_port: {
        type: 'number',
        description: '容器内开发端口，默认 5173'
      }
    },
    required: ['name']
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const name = args.name as string | undefined
    if (!name) {
      return {
        success: false,
        error: '缺少必需参数: name'
      }
    }

    const result = await frontendLabService.createFrontendLab({
      name,
      framework: args.framework as FrontendFramework | undefined,
      containerPort: args.container_port as number | undefined
    })

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              lab_id: result.labId,
              preview_url: result.previewUrl,
              preview_ready: result.previewReady,
              framework: result.framework,
              volume_name: result.volumeName,
              mount_path: result.mountPath,
              bootstrap_status: result.bootstrapStatus,
              build_validated: result.buildValidated,
              status: result.status,
              startup_log_path: result.startupLogPath,
              message: result.message
            },
            null,
            2
          )
        }
      ]
    }
  }
}

/**
 * 获取前端实验室预览地址
 */
export const getPreviewUrlTool: LabToolDefinition = {
  name: 'lab__get_preview_url',
  description: '获取指定前端实验室的预览地址',
  inputSchema: {
    type: 'object',
    properties: {
      lab_id: { type: 'string', description: '实验室 ID' },
      lab_name: { type: 'string', description: '实验室名称，支持模糊匹配' }
    }
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return { success: false, error: '未找到指定的实验室' }
    }

    const previewInfo = await frontendLabService.getPreviewInfo(lab.labId, 3000)
    if (!previewInfo) {
      return { success: false, error: '该实验室没有前端预览地址' }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              lab_id: lab.labId,
              lab_name: lab.name,
              preview_url: previewInfo.previewUrl,
              preview_ready: previewInfo.previewReady,
              startup_log_path: previewInfo.startupLogPath,
              message: previewInfo.message
            },
            null,
            2
          )
        }
      ]
    }
  }
}

/**
 * 重试前端实验室初始化
 */
export const retryFrontendInitializationTool: LabToolDefinition = {
  name: 'lab__retry_frontend_initialization',
  description: '在保留当前工作区的前提下，重试前端实验室的初始化与运行时恢复',
  inputSchema: {
    type: 'object',
    properties: {
      lab_id: { type: 'string', description: '实验室 ID' },
      lab_name: { type: 'string', description: '实验室名称，支持模糊匹配' }
    }
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return { success: false, error: '未找到指定的实验室' }
    }

    if (!lab.frontend) {
      return { success: false, error: '该实验室不是前端实验室' }
    }

    const result = await frontendLabService.retryFrontendInitialization(lab.labId)

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              lab_id: result.labId,
              container_id: result.containerId,
              preview_url: result.previewUrl,
              preview_ready: result.previewReady,
              bootstrap_status: result.bootstrapStatus,
              build_validated: result.buildValidated,
              status: result.status,
              startup_log_path: result.startupLogPath,
              message: result.message
            },
            null,
            2
          )
        }
      ]
    }
  }
}

/**
 * 重建前端运行容器
 */
export const rebuildFrontendRuntimeTool: LabToolDefinition = {
  name: 'lab__rebuild_frontend_runtime',
  description: '删除并重建前端运行容器，但复用原有工作区 volume',
  inputSchema: {
    type: 'object',
    properties: {
      lab_id: { type: 'string', description: '实验室 ID' },
      lab_name: { type: 'string', description: '实验室名称，支持模糊匹配' }
    }
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return { success: false, error: '未找到指定的实验室' }
    }

    if (!lab.frontend) {
      return { success: false, error: '该实验室不是前端实验室' }
    }

    const result = await frontendLabService.rebuildFrontendRuntimeContainer(lab.labId)

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              lab_id: result.labId,
              container_id: result.containerId,
              volume_name: result.volumeName,
              preview_url: result.previewUrl,
              preview_ready: result.previewReady,
              bootstrap_status: result.bootstrapStatus,
              build_validated: result.buildValidated,
              status: result.status,
              startup_log_path: result.startupLogPath,
              message: result.message
            },
            null,
            2
          )
        }
      ]
    }
  }
}

/**
 * 校验前端工作区构建
 */
export const validateFrontendBuildTool: LabToolDefinition = {
  name: 'lab__validate_frontend_build',
  description: '使用 Bun 对指定前端实验室执行一次构建校验，用于导出或预览前健康检查',
  inputSchema: {
    type: 'object',
    properties: {
      lab_id: { type: 'string', description: '实验室 ID' },
      lab_name: { type: 'string', description: '实验室名称，支持模糊匹配' }
    }
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return { success: false, error: '未找到指定的实验室' }
    }

    if (!lab.frontend) {
      return { success: false, error: '该实验室不是前端实验室' }
    }

    const result = await frontendLabService.validateFrontendBuild(lab.labId)

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              lab_id: result.labId,
              container_id: result.containerId,
              preview_url: result.previewUrl,
              preview_ready: result.previewReady,
              bootstrap_status: result.bootstrapStatus,
              build_validated: result.buildValidated,
              status: result.status,
              startup_log_path: result.startupLogPath,
              message: result.message
            },
            null,
            2
          )
        }
      ]
    }
  }
}

export const frontendTools = [
  createFrontendLabTool,
  getPreviewUrlTool,
  retryFrontendInitializationTool,
  rebuildFrontendRuntimeTool,
  validateFrontendBuildTool
]
