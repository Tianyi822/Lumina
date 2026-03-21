import { MCPToolCallResult } from '@main/types/mcp'
import type { FileWriteRequest } from '@shared/types/sandbox'
import { sandboxFileService } from '../file'
import { findSandbox } from './toolExecutor'
import { ToolArgs, SandboxToolDefinition } from './types'

/**
 * 批量写入项目文件
 */
export const writeProjectFilesTool: SandboxToolDefinition = {
  name: 'sandbox__write_project_files',
  description: '批量写入项目文件到沙箱容器内的工作目录',
  inputSchema: {
    type: 'object',
    properties: {
      sandbox_id: { type: 'string', description: '沙箱 ID' },
      sandbox_name: { type: 'string', description: '沙箱名称，支持模糊匹配' },
      project_root: { type: 'string', description: '项目根目录，默认 /app' },
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
  serverName: 'sandbox',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sandbox = await findSandbox(args as { sandbox_id?: string; sandbox_name?: string })
    if (!sandbox) {
      return { success: false, error: '未找到指定的沙箱' }
    }

    const files = args.files as FileWriteRequest[] | undefined
    if (!Array.isArray(files) || files.length === 0) {
      return { success: false, error: '缺少必需参数: files' }
    }

    const projectRoot = args.project_root as string | undefined
    const result = await sandboxFileService.writeProjectFiles(sandbox.sandboxId, files, projectRoot)

    if (!result.success) {
      return {
        success: false,
        error: result.error || '文件写入失败'
      }
    }

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `成功写入 ${result.writtenCount} 个文件到沙箱 ${sandbox.name}`
        }
      ]
    }
  }
}

export const fileTools = [writeProjectFilesTool]
