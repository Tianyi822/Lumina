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
