/**
 * 沙箱生命周期管理工具
 * 包含启动、停止、重启、删除沙箱的工具
 */

import { sandboxService } from '../SandboxService'
import { getDockerService } from '../docker/DockerService'
import { sandboxPermissionService } from '../SandboxPermissionService'
import { MCPToolCallResult } from '@main/types/mcp'
import { DeleteSandboxOptions } from '@shared/types/sandbox'
import { ToolArgs, SandboxToolDefinition } from './types'
import { findSandbox } from './toolExecutor'
import { recoverFrontendSandboxRuntimeIfNeeded } from './createSandbox'

const dockerService = getDockerService()

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
      delete_workspace: {
        type: 'boolean',
        description: '是否同时删除前端工作区（Docker volume），默认为 false',
        default: false
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
    const deleteWorkspace = args.delete_workspace === true // 默认 false
    const force = args.force === true // 默认 false

    const options: DeleteSandboxOptions = {
      deleteContainers,
      deleteWorkspace,
      force
    }

    const result = await sandboxService.deleteSandbox(sandbox.sandboxId, options)

    if (result.success) {
      let msg = deleteContainers
        ? `沙箱 "${sandbox.name}" 及其关联容器已删除。`
        : `沙箱 "${sandbox.name}" 已删除（关联容器保留）。`

      if (deleteWorkspace) {
        msg += result.removedWorkspace
          ? '\n前端工作区已删除。'
          : '\n前端工作区未删除。'
      } else if (result.keptWorkspace) {
        msg += '\n前端工作区已保留。'
      }

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

/**
 * 生命周期管理工具集合
 */
export const lifecycleTools = [
  startSandboxTool,
  stopSandboxTool,
  restartSandboxTool,
  deleteSandboxTool
]
