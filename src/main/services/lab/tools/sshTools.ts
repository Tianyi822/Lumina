/**
 * SSH 管理工具集合
 * 提供 AI 可调用的 SSH 实验室连接/断开工具
 */

import { labService } from '../LabService'
import { sshService } from '../ssh'
import { sshConfigService } from '../ssh/SshConfigService'
import { logger } from '@main/services/logger'
import type { MCPToolCallResult } from '@main/types/mcp'
import type { SaveSshConfigRequest } from '@shared/types/lab'
import type { ToolArgs, LabToolDefinition } from './types'
import { findLab } from './toolExecutor'

/**
 * 创建 SSH 实验室并建立连接
 */
export const sshConnectTool: LabToolDefinition = {
  name: 'lab__ssh_connect',
  description:
    '创建 SSH 远程服务器实验室并建立连接。连接成功后可通过 lab__exec_command 和 lab__write_project_files 在远程服务器上操作',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '实验室名称，建议使用有意义名称如 "prod-server" 或 "dev-ubuntu"'
      },
      host: {
        type: 'string',
        description: 'SSH 服务器地址（IP 或域名）'
      },
      port: {
        type: 'number',
        description: 'SSH 端口号，默认 22',
        default: 22
      },
      username: {
        type: 'string',
        description: 'SSH 登录用户名'
      },
      auth_type: {
        type: 'string',
        enum: ['password', 'key'],
        description: '认证方式：password 使用密码，key 使用密钥文件',
        default: 'password'
      },
      password: {
        type: 'string',
        description: 'SSH 密码（auth_type 为 password 时使用）'
      },
      key_content: {
        type: 'string',
        description: 'SSH 密钥内容（auth_type 为 key 时使用）'
      },
      key_name: {
        type: 'string',
        description: '密钥名称，用于标识密钥文件（auth_type 为 key 时必填）'
      },
      save_config: {
        type: 'boolean',
        description: '是否保存此服务器配置以便后续快速连接，默认 true',
        default: true
      }
    },
    required: ['name', 'host', 'username']
  },
  serverName: 'lab',
  async execute(args: ToolArgs): Promise<MCPToolCallResult> {
    const name = args.name as string
    const host = args.host as string
    const port = (args.port as number) || 22
    const username = args.username as string
    const authType = (args.auth_type as 'password' | 'key') || 'password'
    const saveConfig = args.save_config !== false

    if (!name) {
      return { success: false, error: '缺少必需参数: name' }
    }
    if (!host) {
      return { success: false, error: '缺少必需参数: host' }
    }
    if (!username) {
      return { success: false, error: '缺少必需参数: username' }
    }

    if (authType === 'password' && !args.password) {
      return { success: false, error: '密码认证模式下需要提供 password 参数' }
    }
    if (authType === 'key' && !args.key_content) {
      return { success: false, error: '密钥认证模式下需要提供 key_content 参数' }
    }
    if (authType === 'key' && !args.key_name) {
      return { success: false, error: '密钥认证模式下需要提供 key_name 参数' }
    }

    // 创建实验室元数据
    const createResult = await labService.createLab({
      name,
      creationType: 'ssh',
      sshHost: host,
      sshPort: port,
      sshUsername: username,
      sshAuthType: authType
    })

    if (!createResult.success || !createResult.lab) {
      return { success: false, error: createResult.error || '创建 SSH 实验室失败' }
    }

    const lab = createResult.lab
    const labId = lab.labId

    // 可选保存配置
    let configId: string | undefined
    let configSaveWarning: string | undefined
    if (saveConfig) {
      const saveRequest: SaveSshConfigRequest = {
        name,
        host,
        port,
        username,
        authType,
        keyName: args.key_name as string | undefined,
        keyContent: args.key_content as string | undefined
      }
      const saveResult = sshConfigService.save(saveRequest)
      if (saveResult.success && saveResult.config) {
        configId = saveResult.config.id
      } else {
        configSaveWarning = `配置保存失败: ${saveResult.error}`
      }
    }

    // 建立 SSH 连接
    const connectResult = await sshService.connect(
      labId,
      {
        id: configId || labId,
        name,
        host,
        port,
        username,
        authType,
        keyName: args.key_name as string | undefined,
        keyContent: args.key_content as string | undefined
      },
      args.password as string | undefined
    )

    if (!connectResult.success) {
      lab.status = 'error'
      labService.saveLab(lab)
      return {
        success: false,
        error: `SSH 连接失败: ${connectResult.error || '未知错误'}（实验室已创建，ID: ${labId}）`
      }
    }

    // 更新实验室状态为 running
    lab.status = 'running'
    if (lab.ssh) {
      lab.ssh.connected = true
      lab.ssh.lastConnectedAt = new Date().toISOString()
    }
    labService.saveLab(lab)

    logger.info('SSH 实验室创建并连接成功', 'main', { labId, host, username })

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `SSH 实验室创建并连接成功！\n\n实验室 ID: ${labId}\n名称: ${name}\n类型: SSH\n主机: ${host}:${port}\n用户: ${username}\n状态: 已连接${configSaveWarning ? `\n\n注意: ${configSaveWarning}` : ''}`
        }
      ]
    }
  }
}

/**
 * 断开 SSH 连接
 */
export const sshDisconnectTool: LabToolDefinition = {
  name: 'lab__ssh_disconnect',
  description: '断开 SSH 远程服务器的连接，连接断开后实验室状态将变为 stopped',
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
      return { success: false, error: '未找到指定的实验室' }
    }

    if (lab.backendType !== 'ssh') {
      return { success: false, error: '该实验室不是 SSH 类型，无法执行断开操作' }
    }

    if (!sshService.isConnected(lab.labId)) {
      return { success: false, error: 'SSH 连接已断开' }
    }

    const disconnectResult = await sshService.disconnect(lab.labId)
    if (!disconnectResult.success) {
      return { success: false, error: disconnectResult.error || '断开连接失败' }
    }

    // 更新实验室状态
    lab.status = 'stopped'
    if (lab.ssh) {
      lab.ssh.connected = false
    }
    labService.saveLab(lab)

    logger.info('SSH 连接已断开', 'main', { labId: lab.labId })

    return {
      success: true,
      content: [
        {
          type: 'text',
          text: `SSH 连接已断开。\n\n实验室: ${lab.name}\n状态: stopped`
        }
      ]
    }
  }
}

export const sshTools = [sshConnectTool, sshDisconnectTool]
