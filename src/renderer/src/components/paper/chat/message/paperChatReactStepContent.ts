export type PaperChatStepContentTone = 'error' | 'neutral'

export interface PaperChatStepContentToolItem {
  name: string
  serverName?: string
  status: 'pending' | 'running' | 'success' | 'error'
  error?: string
}

export interface PaperChatStepContentResult {
  content: string
  tone: PaperChatStepContentTone
}

/** 根据工具调用项的状态和内容推导出步骤的显示文案和语气 */
export function derivePaperChatStepContent(
  toolItems: PaperChatStepContentToolItem[],
  content?: string
): PaperChatStepContentResult | null {
  const trimmedContent = content?.trim() ?? ''

  if (toolItems.length === 0) {
    if (isFailureContent(trimmedContent)) return { content: content ?? '', tone: 'error' }
    return null
  }

  if (trimmedContent) {
    return null
  }

  const hasFailedTools = toolItems.some((item) => item.status === 'error')
  if (hasFailedTools) {
    return null
  }

  return buildRunningToolContent(toolItems)
}

/** 构建正在运行中或等待中的工具列表显示文本 */
function buildRunningToolContent(
  toolItems: PaperChatStepContentToolItem[]
): PaperChatStepContentResult | null {
  const runningTools = toolItems.filter((item) => item.status === 'running')
  const pendingTools = toolItems.filter((item) => item.status === 'pending')
  const activeTools = runningTools.length > 0 ? runningTools : pendingTools
  if (activeTools.length === 0) return null

  const names = activeTools.map((item) => `\`${formatToolName(item)}\``).join('、')

  if (runningTools.length > 0) {
    return {
      content: `**执行中**\n\n正在执行工具：${names}`,
      tone: 'neutral'
    }
  }

  return {
    content: `**等待执行**\n\n等待工具：${names}`,
    tone: 'neutral'
  }
}

/** 格式化工具名称，如果来自 MCP 服务器则带上服务器名前缀 */
function formatToolName(item: PaperChatStepContentToolItem): string {
  if (item.serverName && item.serverName !== 'lab') {
    return `${item.serverName}/${item.name}`
  }

  return item.name
}

/** 判断内容是否以失败信息开头 */
function isFailureContent(content: string): boolean {
  return /^(\*\*)?执行失败(\*\*)?[：:。.\s\n]/.test(content)
}
