/**
 * 获取错误消息
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
 * 判断是否为连接错误
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
 * 判断是否为取消错误
 */
export function isCancelError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('cancel') || message.includes('abort')
}
