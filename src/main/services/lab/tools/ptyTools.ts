import type { MCPToolCallResult } from '@main/types/mcp'
import type { ToolArgs, LabToolDefinition } from './types'
import { findLab } from './toolExecutor'
import { sshService } from '../ssh'
import { sshTerminalService } from '../ssh/SshTerminalService'

/**
 * 打开 PTY 终端会话
 * 复用 SshTerminalService.openTerminal，返回 session_id 供后续 send/read/close 使用
 */
export const ptyOpenTool: LabToolDefinition = {
  name: 'lab__pty_open',
  description: '在远程服务器打开交互式 PTY 终端会话，返回 session_id',
  inputSchema: {
    type: 'object',
    properties: {
      lab_id: { type: 'string', description: '实验室 ID' },
      lab_name: { type: 'string', description: '实验室名称，支持模糊匹配' },
      cols: { type: 'number', description: '终端列数，默认 80', default: 80 },
      rows: { type: 'number', description: '终端行数，默认 24', default: 24 }
    }
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const lab = await findLab(args as { lab_id?: string; lab_name?: string })
    if (!lab) {
      return { success: false, error: '未找到指定的实验室' }
    }

    if (!sshService.isConnected(lab.labId)) {
      return { success: false, error: 'SSH 未连接，请先连接远程服务器' }
    }

    const cols = typeof args.cols === 'number' ? args.cols : 80
    const rows = typeof args.rows === 'number' ? args.rows : 24
    const result = await sshTerminalService.openTerminal(lab.labId, { cols, rows })
    if (!result.success) {
      return { success: false, error: result.error || '打开终端失败' }
    }

    return {
      success: true,
      content: [
        { type: 'text', text: JSON.stringify({ session_id: result.sessionId, lab_id: lab.labId }) }
      ]
    }
  }
}

/**
 * 向 PTY 终端发送输入（命令、按键）
 */
export const ptySendTool: LabToolDefinition = {
  name: 'lab__pty_send',
  description: '向 PTY 终端会话发送输入（命令或按键，换行需显式加 \\n）',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: '终端会话 ID' },
      data: { type: 'string', description: '要发送的输入（命令、按键；换行需显式加 \\n）' }
    },
    required: ['session_id', 'data']
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sessionId = args.session_id as string | undefined
    if (!sessionId) {
      return { success: false, error: '缺少必需参数: session_id' }
    }
    const data = args.data as string | undefined
    if (data === undefined || data === null) {
      return { success: false, error: '缺少必需参数: data' }
    }

    const result = sshTerminalService.writeTerminal(sessionId, data)
    if (!result.success) {
      return { success: false, error: result.error || '发送失败' }
    }

    return { success: true, content: [{ type: 'text', text: '已发送' }] }
  }
}

/**
 * 读取 PTY 终端的缓冲输出
 * 读取并清空模型专用缓冲区；可等待新数据到达
 */
export const ptyReadTool: LabToolDefinition = {
  name: 'lab__pty_read',
  description: '读取 PTY 终端会话的缓冲输出（读取后清空），支持等待新数据',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: '终端会话 ID' },
      wait_ms: {
        type: 'number',
        description: '缓冲为空时最多等待新数据的毫秒数，默认 1000',
        default: 1000
      },
      max_bytes: {
        type: 'number',
        description: '单次返回的最大字符数（UTF-16 code units），默认 20000',
        default: 20000
      }
    },
    required: ['session_id']
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sessionId = args.session_id as string | undefined
    if (!sessionId) {
      return { success: false, error: '缺少必需参数: session_id' }
    }

    const waitMs = typeof args.wait_ms === 'number' ? args.wait_ms : 1000
    const maxBytes = typeof args.max_bytes === 'number' ? args.max_bytes : 20000
    const result = await sshTerminalService.readBuffer(sessionId, waitMs, maxBytes)

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            session_id: sessionId,
            data: result.data,
            closed: result.closed,
            truncated: result.truncated,
            exited: result.exited,
            exit_code: result.exitCode
          })
        }
      ]
    }
  }
}

/**
 * 关闭 PTY 终端会话
 */
export const ptyCloseTool: LabToolDefinition = {
  name: 'lab__pty_close',
  description: '关闭 PTY 终端会话，释放资源',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: '终端会话 ID' }
    },
    required: ['session_id']
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const sessionId = args.session_id as string | undefined
    if (!sessionId) {
      return { success: false, error: '缺少必需参数: session_id' }
    }

    const result = sshTerminalService.closeTerminal(sessionId)
    if (!result.success) {
      return { success: false, error: result.error || '关闭失败' }
    }

    return { success: true, content: [{ type: 'text', text: `已关闭终端: ${sessionId}` }] }
  }
}

export const ptyTools: LabToolDefinition[] = [ptyOpenTool, ptySendTool, ptyReadTool, ptyCloseTool]
