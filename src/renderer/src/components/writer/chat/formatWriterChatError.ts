/**
 * 将写作对话底层错误整理为通知可读文案。
 * 保留原始错误关键词，避免只显示笼统「模型请求失败」。
 */
export function formatWriterChatError(raw: string): string {
  const message = raw.trim()
  if (!message) {
    return '模型请求失败，请稍后重试或换一个模型。'
  }

  const lower = message.toLowerCase()
  if (
    lower === 'terminated' ||
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('socket hang up')
  ) {
    return `连接已中断（${message}），请稍后重试或换一个模型。`
  }

  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('aborted')) {
    return `请求超时或已中断（${message}），请稍后重试。`
  }

  if (message.length > 240) {
    return `${message.slice(0, 240)}…`
  }
  return message
}
