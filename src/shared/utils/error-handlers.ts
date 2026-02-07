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

/**
 * 判断错误是否为连接相关错误
 */
export function isConnectionError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('connect') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('timeout')
  )
}

/**
 * 判断错误是否为取消或中止操作产生的错误
 */
export function isCancelError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('cancel') || message.includes('abort')
}
