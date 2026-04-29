import { getDockerService } from '../docker/DockerService'
import { MCPToolCallResult } from '@main/types/mcp'
import { ExecCommand } from '@shared/types/lab'
import { ToolArgs, LabToolDefinition } from './types'
import { findLab, isDangerousCommand } from './toolExecutor'

const dockerService = getDockerService()

/**
 * 在容器中执行命令
 */
export const execCommandTool: LabToolDefinition = {
  name: 'lab__exec_command',
  description:
    '在指定实验室的容器中执行命令，可用于调试、查看数据或管理应用。命令执行有 30 秒超时限制',
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

    // 命令安全检查
    if (isDangerousCommand(command)) {
      return {
        success: false,
        error: '命令包含危险操作，已被拦截。高风险命令需要用户手动在终端中执行。'
      }
    }

    const containerId = lab.primaryContainerId || lab.containerIds?.[0]
    if (!containerId) {
      return {
        success: false,
        error: '实验室没有关联的容器'
      }
    }

    // 检查容器是否运行
    const details = await dockerService.getContainerDetails(containerId)
    if (details?.state !== 'running') {
      return {
        success: false,
        error: '容器未运行，请先启动实验室'
      }
    }

    const timeout = typeof args.timeout === 'number' ? Math.min(args.timeout, 300) : 30

    const execCmd: ExecCommand = {
      command,
      workdir: args.workdir as string,
      timeout
    }

    const result = await dockerService.execCommand(containerId, execCmd)

    if (!result) {
      return {
        success: false,
        error: '命令执行失败'
      }
    }

    const output = result.stdout || result.stderr || '（无输出）'
    const exitInfo = result.exitCode === 0 ? '' : `\n（退出码: ${result.exitCode}）`

    return {
      success: result.exitCode === 0,
      content: [
        {
          type: 'text',
          text: `命令执行结果:${exitInfo}\n\n\`\`\`\n${output}\n\`\`\``
        }
      ]
    }
  }
}

export const execTools = [execCommandTool]
