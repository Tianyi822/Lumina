/**
 * 实验室生命周期管理工具
 * 包含启动、停止、重启、删除实验室的工具
 */

import { labService } from '../LabService'
import { getDockerService } from '../docker/DockerService'
import { labPermissionService } from '../LabPermissionService'
import type { MCPToolCallResult } from '@main/types/mcp'
import type { DeleteLabOptions } from '@shared/types/lab'
import type { ToolArgs, LabToolDefinition } from './types'
import { findLab } from './toolExecutor'
import { recoverFrontendLabRuntimeIfNeeded } from './createLab'

const dockerService = getDockerService()

/**
 * 启动实验室
 */
export const startLabTool: LabToolDefinition = {
  name: 'lab__start_lab',
  description: '启动已停止的实验室，启动后容器将开始运行',
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

    // 权限检查
    if (!labPermissionService.canStart(lab.creationType)) {
      return {
        success: false,
        error: `类型为 "${lab.creationType}" 的实验室不允许启动操作`
      }
    }

    // 启动所有关联容器
    const results = await Promise.all(
      (lab.containerIds || []).map(async (id) => {
        const result = await dockerService.startContainer(id)
        return { id: id.substring(0, 12), success: result.success, error: result.error }
      })
    )

    const allSuccess = results.every((r) => r.success)
    const failed = results.filter((r) => !r.success)

    if (allSuccess) {
      // 更新实验室状态
      lab.status = 'running'
      lab.updatedAt = new Date().toISOString()
      await labService.saveLab(lab)

      const frontendRecovery = await recoverFrontendLabRuntimeIfNeeded(lab)
      let message = `实验室 "${lab.name}" 启动成功！\n已启动 ${results.length} 个容器。`
      if (frontendRecovery.warning) {
        message += `\n\n⚠️ ${frontendRecovery.warning}`
      } else if (lab.frontend && frontendRecovery.previewUrl) {
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
 * 停止实验室
 */
export const stopLabTool: LabToolDefinition = {
  name: 'lab__stop_lab',
  description: '停止运行中的实验室，停止后容器将不再运行但数据会保留',
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
      timeout: {
        type: 'number',
        description: '停止超时时间（秒），默认 10 秒',
        default: 10
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

    // 权限检查
    if (!labPermissionService.canStop(lab.creationType)) {
      return {
        success: false,
        error: `类型为 "${lab.creationType}" 的实验室不允许停止操作`
      }
    }

    const timeout = typeof args.timeout === 'number' ? args.timeout : 10

    // 停止所有关联容器
    const results = await Promise.all(
      (lab.containerIds || []).map(async (id) => {
        const result = await dockerService.stopContainer(id, timeout)
        return { id: id.substring(0, 12), success: result.success, error: result.error }
      })
    )

    const allSuccess = results.every((r) => r.success)
    const failed = results.filter((r) => !r.success)

    if (allSuccess) {
      // 更新实验室状态
      lab.status = 'stopped'
      lab.updatedAt = new Date().toISOString()
      await labService.saveLab(lab)

      return {
        success: true,
        content: [
          {
            type: 'text',
            text: `实验室 "${lab.name}" 已停止。\n已停止 ${results.length} 个容器。`
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
 * 重启实验室
 */
export const restartLabTool: LabToolDefinition = {
  name: 'lab__restart_lab',
  description: '重启实验室，相当于先停止再启动',
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

    // 权限检查
    if (!labPermissionService.canRestart(lab.creationType)) {
      return {
        success: false,
        error: `类型为 "${lab.creationType}" 的实验室不允许重启操作`
      }
    }

    // 重启所有关联容器
    const results = await Promise.all(
      (lab.containerIds || []).map(async (id) => {
        const result = await dockerService.restartContainer(id)
        return { id: id.substring(0, 12), success: result.success, error: result.error }
      })
    )

    const allSuccess = results.every((r) => r.success)
    const failed = results.filter((r) => !r.success)

    if (allSuccess) {
      // 更新实验室状态
      lab.status = 'running'
      lab.updatedAt = new Date().toISOString()
      await labService.saveLab(lab)

      const frontendRecovery = await recoverFrontendLabRuntimeIfNeeded(lab)

      let message = `实验室 "${lab.name}" 重启成功！\n已重启 ${results.length} 个容器。`
      if (frontendRecovery.warning) {
        message += `\n\n⚠️ ${frontendRecovery.warning}`
      } else if (lab.frontend && frontendRecovery.previewUrl) {
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
 * 删除实验室
 */
export const deleteLabTool: LabToolDefinition = {
  name: 'lab__delete_lab',
  description:
    '删除实验室。注意：此操作会删除实验室元数据，可选择是否同时删除关联的容器和数据。删除后不可恢复，请谨慎操作',
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
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return {
        success: false,
        error: '未找到指定的实验室'
      }
    }

    const deleteContainers = args.delete_containers !== false // 默认 true
    const deleteWorkspace = args.delete_workspace === true // 默认 false
    const force = args.force === true // 默认 false

    const options: DeleteLabOptions = {
      deleteContainers,
      deleteWorkspace,
      force
    }

    const result = await labService.deleteLab(lab.labId, options)

    if (result.success) {
      let msg = deleteContainers
        ? `实验室 "${lab.name}" 及其关联容器已删除。`
        : `实验室 "${lab.name}" 已删除（关联容器保留）。`

      if (deleteWorkspace) {
        msg += result.removedWorkspace ? '\n前端工作区已删除。' : '\n前端工作区未删除。'
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
        error: result.error || '删除实验室失败'
      }
    }
  }
}

/**
 * 生命周期管理工具集合
 */
export const lifecycleTools = [startLabTool, stopLabTool, restartLabTool, deleteLabTool]
