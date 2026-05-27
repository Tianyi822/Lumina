/**
 * 从错误对象中提取可读的错误消息
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return '未知错误'
}
