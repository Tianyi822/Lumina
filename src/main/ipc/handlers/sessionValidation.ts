/**
 * Session IPC 输入校验函数
 * 纯函数，不依赖 electron，便于测试
 */

/** 校验 session:create 的 title 参数 */
export function validateSessionTitle(title: unknown): string | null {
  if (title === undefined || title === null) {
    return null // 标题可选
  }
  if (typeof title !== 'string') {
    return '标题必须是字符串'
  }
  if (title.length > 200) {
    return '标题长度不能超过 200 个字符'
  }
  return null
}

/** 校验 session:appendMessages 的 messages 参数 */
export function validateAppendMessages(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return '消息必须是数组'
  }
  if (messages.length === 0) {
    return '消息数组不能为空'
  }
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) {
      return '消息结构无效'
    }
    const record = message as Record<string, unknown>
    if (
      typeof record.id !== 'string' ||
      typeof record.role !== 'string' ||
      typeof record.content !== 'string'
    ) {
      return '消息结构无效'
    }
  }
  return null
}

/** 校验 session:updateMeta 的 patch 参数 */
export function validateSessionMetaPatch(patch: unknown): string | null {
  if (typeof patch !== 'object' || patch === null) {
    return '元数据补丁必须是对象'
  }
  const record = patch as Record<string, unknown>
  if (record.title !== undefined) {
    if (typeof record.title !== 'string') {
      return '标题必须是字符串'
    }
    if (record.title.length > 200) {
      return '标题长度不能超过 200 个字符'
    }
  }
  return null
}
