import { MCPToolCallResult } from '@main/types/mcp'
import type { FrontendFramework } from '@shared/types/sandbox'
import { frontendSandboxService } from '../frontend'
import { findSandbox } from './toolExecutor'
import { ToolArgs, SandboxToolDefinition } from './types'

/**
 * 创建前端沙箱
 */
export const createFrontendSandboxTool: SandboxToolDefinition = {
  name: 'sandbox__create_frontend_sandbox',
  description: '创建一个用于运行前端项目的沙箱容器，并返回预览 URL',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '沙箱名称' },
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
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const name = args.name as string | undefined
    if (!name) {
      return {
        success: false,
        error: '缺少必需参数: name'
      }
    }

    const result = await frontendSandboxService.createFrontendSandbox({
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
              sandbox_id: result.sandboxId,
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
 * 获取前端沙箱预览地址
 */
export const getPreviewUrlTool: SandboxToolDefinition = {
  name: 'sandbox__get_preview_url',
  description: '获取指定前端沙箱的预览地址',
  inputSchema: {
    type: 'object',
    properties: {
      sandbox_id: { type: 'string', description: '沙箱 ID' },
      sandbox_name: { type: 'string', description: '沙箱名称，支持模糊匹配' }
    }
  },
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return { success: false, error: '未找到指定的沙箱' }
    }

    const previewInfo = await frontendSandboxService.getPreviewInfo(sandbox.sandboxId, 3000)
    if (!previewInfo) {
      return { success: false, error: '该沙箱没有前端预览地址' }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sandbox_id: sandbox.sandboxId,
              sandbox_name: sandbox.name,
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
 * 重试前端沙箱初始化
 */
export const retryFrontendInitializationTool: SandboxToolDefinition = {
  name: 'sandbox__retry_frontend_initialization',
  description: '在保留当前工作区的前提下，重试前端沙箱的初始化与运行时恢复',
  inputSchema: {
    type: 'object',
    properties: {
      sandbox_id: { type: 'string', description: '沙箱 ID' },
      sandbox_name: { type: 'string', description: '沙箱名称，支持模糊匹配' }
    }
  },
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return { success: false, error: '未找到指定的沙箱' }
    }

    if (!sandbox.frontend) {
      return { success: false, error: '该沙箱不是前端沙箱' }
    }

    const result = await frontendSandboxService.retryFrontendInitialization(sandbox.sandboxId)

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sandbox_id: result.sandboxId,
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
export const rebuildFrontendRuntimeTool: SandboxToolDefinition = {
  name: 'sandbox__rebuild_frontend_runtime',
  description: '删除并重建前端运行容器，但复用原有工作区 volume',
  inputSchema: {
    type: 'object',
    properties: {
      sandbox_id: { type: 'string', description: '沙箱 ID' },
      sandbox_name: { type: 'string', description: '沙箱名称，支持模糊匹配' }
    }
  },
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return { success: false, error: '未找到指定的沙箱' }
    }

    if (!sandbox.frontend) {
      return { success: false, error: '该沙箱不是前端沙箱' }
    }

    const result = await frontendSandboxService.rebuildFrontendRuntimeContainer(sandbox.sandboxId)

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sandbox_id: result.sandboxId,
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
export const validateFrontendBuildTool: SandboxToolDefinition = {
  name: 'sandbox__validate_frontend_build',
  description: '使用 Bun 对指定前端沙箱执行一次构建校验，用于导出或预览前健康检查',
  inputSchema: {
    type: 'object',
    properties: {
      sandbox_id: { type: 'string', description: '沙箱 ID' },
      sandbox_name: { type: 'string', description: '沙箱名称，支持模糊匹配' }
    }
  },
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return { success: false, error: '未找到指定的沙箱' }
    }

    if (!sandbox.frontend) {
      return { success: false, error: '该沙箱不是前端沙箱' }
    }

    const result = await frontendSandboxService.validateFrontendBuild(sandbox.sandboxId)

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sandbox_id: result.sandboxId,
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
  createFrontendSandboxTool,
  getPreviewUrlTool,
  retryFrontendInitializationTool,
  rebuildFrontendRuntimeTool,
  validateFrontendBuildTool
]
