import type { MCPToolCallResult } from '@main/types/mcp'
import type { ToolArgs, LabToolDefinition } from './types'
import { findLab } from './toolExecutor'
import { sshService } from '../ssh'

/**
 * 判定删除路径是否高危，需用户交互确认
 * 命中条件：根目录、父目录穿越、通配符、家目录简写、系统/敏感路径
 */
export function isDangerousPath(path: string): boolean {
  if (!path) return true
  const normalized = path.trim()

  // 根目录或纯盘符根
  if (normalized === '/' || /^[A-Za-z]:[\\/]?$/.test(normalized)) return true
  // 父目录穿越（按路径段精确匹配，避免误伤含 .. 的合法文件名）
  const segments = normalized.split(/[\\/]+/).filter(Boolean)
  if (segments.includes('..')) return true
  // 通配符
  if (/[*?]/.test(normalized)) return true
  // 家目录简写
  if (normalized.startsWith('~')) return true
  // 系统/敏感路径前缀（含 root 账户家目录）
  const systemPrefixes = [
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/boot',
    '/dev',
    '/proc',
    '/sys',
    '/var',
    '/root'
  ]
  if (systemPrefixes.some((p) => normalized === p || normalized.startsWith(p + '/'))) return true
  // 敏感隐藏文件（整个路径段匹配）
  const sensitiveNames = ['.ssh', '.bashrc', '.bash_profile', '.profile', '.bash_history']
  if (segments.some((s) => sensitiveNames.includes(s))) return true

  return false
}

/**
 * 读取远程文件内容
 * 支持 offset 分页与 max_bytes 截断，二进制文件拒绝读取
 */
export const readFileTool: LabToolDefinition = {
  name: 'lab__read_file',
  description: '读取远程服务器上的文件内容，支持分页与字节截断',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '远程文件绝对路径或相对工作目录路径' },
      max_bytes: { type: 'number', description: '最大返回字节数，默认 20000', default: 20000 },
      offset: {
        type: 'number',
        description: '读取起始字节偏移，用于分页',
        default: 0
      }
    },
    required: ['path']
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return { success: false, error: '未找到指定的实验室' }
    }

    const path = args.path as string | undefined
    if (!path) {
      return { success: false, error: '缺少必需参数: path' }
    }

    if (!sshService.isConnected(lab.labId)) {
      return { success: false, error: 'SSH 未连接，请先连接远程服务器' }
    }

    const result = await sshService.readFile(lab.labId, path, {
      offset: typeof args.offset === 'number' ? args.offset : undefined,
      maxBytes: typeof args.max_bytes === 'number' ? args.max_bytes : 20000
    })
    if (!result.success) {
      return { success: false, error: result.error || '文件读取失败' }
    }

    return {
      success: true,
      content: [{ type: 'text', text: JSON.stringify(result) }]
    }
  }
}

/**
 * 列出远程目录内容
 * 支持递归列举与条目上限截断
 */
export const listFilesTool: LabToolDefinition = {
  name: 'lab__list_files',
  description: '列出远程服务器目录内容，支持递归与条目上限',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '远程目录路径，默认工作目录' },
      recursive: { type: 'boolean', description: '是否递归列举', default: false },
      max_entries: { type: 'number', description: '最大返回条目数，默认 500', default: 500 }
    }
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return { success: false, error: '未找到指定的实验室' }
    }

    const path = (args.path as string | undefined) || '.'
    if (!sshService.isConnected(lab.labId)) {
      return { success: false, error: 'SSH 未连接，请先连接远程服务器' }
    }

    const result = await sshService.listFiles(lab.labId, path, {
      recursive: typeof args.recursive === 'boolean' ? args.recursive : undefined,
      maxEntries: typeof args.max_entries === 'number' ? args.max_entries : 500
    })
    if (!result.success) {
      return { success: false, error: result.error || '列目录失败' }
    }

    return {
      success: true,
      content: [{ type: 'text', text: JSON.stringify(result) }]
    }
  }
}

/**
 * 删除远程文件或目录
 * 高危路径（根/系统目录/敏感文件等）需用户交互确认后才执行
 */
export const deleteFileTool: LabToolDefinition = {
  name: 'lab__delete_file',
  description: '删除远程服务器上的文件或目录（目录递归删除），高危路径需确认',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '远程文件或目录路径（目录递归删除）' }
    },
    required: ['path']
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const path = args.path as string | undefined
    if (!path) {
      return { success: false, error: '缺少必需参数: path' }
    }

    // 高危路径最先判定（纯路径检查，不依赖任何运行时状态），返回用户交互确认
    // 已知缺口：用户确认后模型若再次调用 delete_file，isDangerousPath 仍返回 true，
    // 会再次触发确认（潜在死循环）。spec §2.2 未定义确认后执行机制，留后续迭代。
    if (isDangerousPath(path)) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              user_interaction_required: true,
              question: `确认删除高危路径 "${path}" 吗？此操作不可恢复。`,
              options: [
                { label: '确认删除', value: 'confirm_delete' },
                { label: '取消', value: 'cancel' }
              ]
            })
          }
        ]
      }
    }

    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return { success: false, error: '未找到指定的实验室' }
    }

    if (!sshService.isConnected(lab.labId)) {
      return { success: false, error: 'SSH 未连接，请先连接远程服务器' }
    }

    const result = await sshService.deleteFile(lab.labId, path)
    if (!result.success) {
      return { success: false, error: result.error || '删除失败' }
    }

    return {
      success: true,
      content: [{ type: 'text', text: `已删除: ${path}` }]
    }
  }
}

export const fileReadTools: LabToolDefinition[] = [readFileTool, listFilesTool, deleteFileTool]
