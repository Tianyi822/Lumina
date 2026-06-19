import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { LabDisciplineId } from '@shared/types/config'
import { labToolService } from '../../../lab'

/** 实验室工具适配器所需的会话上下文 */
export interface LabAdapterContext {
  /** 当前会话激活的实验室学科 */
  labDiscipline?: LabDisciplineId | null
  /** 当前会话绑定的实验室 ID（execute 时自动注入到工具参数） */
  labId?: string | null
}

/**
 * 实验室工具适配器
 * 将 LabToolService 适配为统一的 ToolAdapter 接口。
 * 构造时接收会话上下文：getTools 按学科过滤，execute 自动注入 labId。
 */
export class LabToolAdapter implements ToolAdapter {
  private readonly context: LabAdapterContext

  constructor(context: LabAdapterContext) {
    this.context = context
  }

  /**
   * 获取实验室工具列表（按 context.labDiscipline 过滤）
   */
  async getTools(): Promise<MCPToolReference[]> {
    return labToolService.getTools({ discipline: this.context.labDiscipline }).map((tool) => ({
      serverName: tool.serverName || 'lab',
      toolName: tool.name.startsWith('lab__') ? tool.name.slice('lab__'.length) : tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>
    }))
  }

  /**
   * 执行实验室工具调用
   * 自动将 context.labId 注入到工具参数（除非调用方已显式提供 lab_id）
   * @param onProgress 执行进度回调（可选）
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    onProgress?: (message: string) => void
  ): Promise<MCPToolCallResult> {
    const fullName = toolName.startsWith('lab__') ? toolName : `lab__${toolName}`
    // 注入 labId（pty_open/read_file 等需 lab_id 定位实验室；已显式提供时不覆盖）
    const mergedArgs = { ...args }
    if (this.context.labId && !mergedArgs.lab_id) {
      mergedArgs.lab_id = this.context.labId
    }
    return labToolService.callTool(fullName, mergedArgs, onProgress)
  }
}
