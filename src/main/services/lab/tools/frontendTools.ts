import { MCPToolCallResult } from '@main/types/mcp'
import type { FrontendFramework, LabData } from '@shared/types/lab'
import { frontendLabService } from '../frontend'
import { labService } from '../LabService'
import { findLab } from './toolExecutor'
import { selectReusableFrontendLab } from './toolHelpers'
import { ToolArgs, LabToolDefinition } from './types'

const DEFAULT_FRONTEND_FRAMEWORK: FrontendFramework = 'vue'

async function findReusableFrontendLab(
  name: string,
  framework: FrontendFramework
): Promise<LabData | null> {
  const labItems = await labService.listLabs()
  const labs = labItems
    .map((item) =>
      labService.loadLab(item.labId, {
        silent: true
      })
    )
    .filter((lab): lab is LabData => !!lab)

  return selectReusableFrontendLab(labs, name, framework)
}

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
      },
      reuse_existing: {
        type: 'boolean',
        description: '是否复用同名同框架前端实验室，默认 true'
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

    const framework =
      (args.framework as FrontendFramework | undefined) || DEFAULT_FRONTEND_FRAMEWORK
    const shouldReuse = args.reuse_existing !== false

    if (shouldReuse) {
      const reusableLab = await findReusableFrontendLab(name, framework)
      if (reusableLab?.frontend) {
        const previewInfo = await frontendLabService.getPreviewInfo(reusableLab.labId, 3000)

        return {
          success: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  lab_id: reusableLab.labId,
                  container_id: reusableLab.primaryContainerId,
                  preview_url: previewInfo?.previewUrl || reusableLab.frontend.previewUrl,
                  preview_ready: previewInfo?.previewReady ?? false,
                  framework: reusableLab.frontend.framework,
                  volume_name: reusableLab.frontend.volumeName,
                  mount_path: reusableLab.frontend.mountPath,
                  project_root: reusableLab.frontend.projectRoot,
                  bootstrap_status: reusableLab.frontend.bootstrapStatus,
                  build_validated: reusableLab.frontend.buildValidated,
                  status: reusableLab.status,
                  startup_log_path: previewInfo?.startupLogPath,
                  message: previewInfo?.message || '已复用现有同名前端实验室',
                  reused: true
                },
                null,
                2
              )
            }
          ]
        }
      }
    }

    const result = await frontendLabService.createFrontendLab({
      name,
      framework,
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
              project_root: result.projectRoot,
              bootstrap_status: result.bootstrapStatus,
              build_validated: result.buildValidated,
              status: result.status,
              startup_log_path: result.startupLogPath,
              message: result.message,
              reused: false
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
