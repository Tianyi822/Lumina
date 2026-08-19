import { i18n } from '@renderer/i18n'

/**
 * 将写作对话底层错误整理为通知可读文案。
 * 保留原始错误关键词，避免只显示笼统「模型请求失败」。
 */
export function formatWriterChatError(raw: string): string {
  const message = raw.trim()
  if (!message) {
    return i18n.t('writer.chat.requestFailed')
  }

  const lower = message.toLowerCase()
  if (
    lower === 'terminated' ||
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('socket hang up')
  ) {
    return i18n.t('writer.chat.interrupted', { message })
  }

  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('aborted')) {
    return i18n.t('writer.chat.timeout', { message })
  }

  if (message.length > 240) {
    return `${message.slice(0, 240)}…`
  }
  return message
}
