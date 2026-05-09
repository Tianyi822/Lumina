import { getDockerService } from '../docker/DockerService'
import type { MCPToolCallResult } from '@main/types/mcp'
import type { ExecCommand } from '@shared/types/lab'
import type { ToolArgs, LabToolDefinition } from './types'
import { getCommandExecutionPolicy } from './commandExecutionPolicy'
import { findLab } from './toolExecutor'
import { formatExecCommandToolResult } from './toolHelpers'
import { sshService } from '../ssh'

const dockerService = getDockerService()

/**
 * 在实验室中执行命令
 */
export const execCommandTool: LabToolDefinition = {
  name: 'lab__exec_command',
  description:
    '在指定实验室中执行命令，可用于调试、查看数据或管理应用。支持 Docker 容器沙箱和 SSH 远程服务器，命令执行有 30 秒超时限制',
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
      command: {
        type: 'string',
        description: '要执行的命令，如 "ls -la" 或 "mysql -e SHOW DATABASES"'
      },
      workdir: {
        type: 'string',
        description: '命令执行的工作目录（可选）'
      },
      timeout: {
        type: 'number',
        description: '命令执行超时时间（秒），默认 30 秒，最大 300 秒',
        default: 30
      }
    },
    required: ['command']
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

    const command = args.command as string
    if (!command) {
      return {
        success: false,
        error: '缺少必需参数: command'
      }
    }

    const policy = getCommandExecutionPolicy('lab_sandbox', command)
    if (policy.requiresUserInteraction) {
      return {
        success: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              user_interaction_required: true,
              question: policy.reason || '是否允许执行该命令？',
              options: policy.options || []
            })
          }
        ]
      }
    }

    if (!policy.canExecute) {
      return {
        success: false,
        error: policy.reason || '当前命令执行策略不允许直接执行'
      }
    }

    const timeout = typeof args.timeout === 'number' ? Math.min(args.timeout, 300) : 30
    const execCmd: ExecCommand = {
      command,
      workdir: args.workdir as string,
      timeout
    }

    // SSH 后端分支
    if (lab.backendType === 'ssh') {
      if (!sshService.isConnected(lab.labId)) {
        return { success: false, error: 'SSH 未连接，请先连接远程服务器' }
      }

      const result = await sshService.execCommand(lab.labId, execCmd)
      if (!result || result.systemError) {
        return { success: false, error: result?.stderr || 'SSH 命令执行失败' }
      }
      return formatExecCommandToolResult(command, execCmd.workdir, result)
    }

    // Docker 后端分支
    const containerId = lab.primaryContainerId || lab.containerIds?.[0]
    if (!containerId) {
      return {
        success: false,
        error: '实验室没有关联的容器'
      }
    }

    const details = await dockerService.getContainerDetails(containerId)
    if (details?.state !== 'running') {
      return {
        success: false,
        error: '容器未运行，请先启动实验室'
      }
    }

    const result = await dockerService.execCommand(containerId, execCmd)

    if (!result || result.systemError) {
      return {
        success: false,
        error: result?.stderr || '命令执行失败'
      }
    }

    return formatExecCommandToolResult(command, execCmd.workdir, result)
  }
}

export const execTools = [execCommandTool]
