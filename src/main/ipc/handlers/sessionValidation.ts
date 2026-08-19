/**
 * Session IPC 输入校验函数
 * 纯函数，不依赖 electron，便于测试
 */

import { t } from '@main/services/i18n'

/** 标题最大长度（session:create 与 session:updateMeta 共用） */
const TITLE_MAX_LENGTH = 200

/** 校验 session:create 的 title 参数 */
export function validateSessionTitle(title: unknown): string | null {
  if (title === undefined || title === null) {
    return null // 标题可选
  }
  if (typeof title !== 'string') {
    return t('notifications.session.validateTitleType')
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return t('notifications.session.validateTitleTooLong', { max: TITLE_MAX_LENGTH })
  }
  return null
}

/** 校验 session:appendMessages 的 messages 参数 */
export function validateAppendMessages(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return t('notifications.session.validateMessagesType')
  }
  if (messages.length === 0) {
    return t('notifications.session.validateMessagesEmpty')
  }
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) {
      return t('notifications.session.validateMessageStructure')
    }
    const record = message as Record<string, unknown>
    if (
      typeof record.id !== 'string' ||
      typeof record.role !== 'string' ||
      typeof record.content !== 'string'
    ) {
      return t('notifications.session.validateMessageStructure')
    }
  }
  return null
}

/** 校验 session:updateMeta 的 patch 参数 */
export function validateSessionMetaPatch(patch: unknown): string | null {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return t('notifications.session.validateMetaPatchType')
  }
  const record = patch as Record<string, unknown>
  if (record.title !== undefined) {
    if (typeof record.title !== 'string') {
      return t('notifications.session.validateTitleType')
    }
    if (record.title.length > TITLE_MAX_LENGTH) {
      return t('notifications.session.validateTitleTooLong', { max: TITLE_MAX_LENGTH })
    }
  }
  return null
}
