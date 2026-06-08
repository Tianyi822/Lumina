import type { MCPToolCallResult } from '@main/types/mcp'
import type { FileWriteRequest } from '@shared/types/lab'
import { findLab } from './toolExecutor'
import { resolveProjectRootForWrite } from './toolHelpers'
import type { ToolArgs, LabToolDefinition } from './types'
import { sshService } from '../ssh'

/**
 * 批量写入项目文件
 */
export const writeProjectFilesTool: LabToolDefinition = {
  name: 'lab__write_project_files',
  description: '批量写入项目文件到实验室的工作目录，通过 SSH 写入远程服务器',
  inputSchema: {
    type: 'object',
    properties: {
      lab_id: { type: 'string', description: '实验室 ID' },
      lab_name: { type: 'string', description: '实验室名称，支持模糊匹配' },
      project_root: {
        type: 'string',
        description: '项目根目录（可选）'
      },
      files: {
        type: 'array',
        description: '待写入的文件列表',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '相对于项目根目录的文件路径' },
            content: { type: 'string', description: '文件内容' }
          },
          required: ['path', 'content']
        }
      }
    },
    required: ['files']
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return { success: false, error: '未找到指定的实验室' }
    }

    const files = args.files as FileWriteRequest[] | undefined
    if (!Array.isArray(files) || files.length === 0) {
      return { success: false, error: '缺少必需参数: files' }
    }

    const projectRoot = resolveProjectRootForWrite(lab, args.project_root as string | undefined)

    if (!sshService.isConnected(lab.labId)) {
      return { success: false, error: 'SSH 未连接，请先连接远程服务器' }
    }

    const result = await sshService.writeFiles(lab.labId, files, projectRoot)
    if (!result.success) {
      return { success: false, error: result.error || '文件写入失败' }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `成功写入 ${result.writtenCount} 个文件到远程服务器 ${lab.name}`
        }
      ]
    }
  }
}

export const fileTools = [writeProjectFilesTool]
