import type { DockerContainerErrorReason } from '@shared/types/lab'

interface DockerErrorShape {
  message?: unknown
  reason?: unknown
  statusCode?: unknown
  status?: unknown
  code?: unknown
  json?: {
    message?: unknown
    error?: unknown
  }
}

/**
 * Docker API 错误，携带可供上层决策的原因分类。
 */
export class DockerOperationError extends Error {
  readonly reason: DockerContainerErrorReason
  readonly statusCode?: number

  constructor(message: string, reason: DockerContainerErrorReason, statusCode?: number) {
    super(message)
    this.name = 'DockerOperationError'
    this.reason = reason
    this.statusCode = statusCode
  }
}

function getDockerErrorShape(error: unknown): DockerErrorShape {
  return error && typeof error === 'object' ? (error as DockerErrorShape) : {}
}

function getStatusCode(error: unknown): number | undefined {
  const shape = getDockerErrorShape(error)
  const rawStatus = shape.statusCode ?? shape.status
  return typeof rawStatus === 'number' ? rawStatus : undefined
}

export function getDockerErrorMessage(error: unknown): string {
  const shape = getDockerErrorShape(error)
  const parts = [shape.message, shape.reason, shape.code, shape.json?.message, shape.json?.error]
    .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
    .map((part) => String(part).trim())
    .filter(Boolean)

  return parts[0] || String(error)
}

export function classifyDockerError(error: unknown): DockerContainerErrorReason {
  if (error instanceof DockerOperationError) {
    return error.reason
  }

  const statusCode = getStatusCode(error)
  const message = getDockerErrorMessage(error).toLowerCase()

  if (
    statusCode === 404 ||
    message.includes('no such container') ||
    message.includes('container not found') ||
    message.includes('容器不存在')
  ) {
    return 'not_found'
  }

  if (
    (typeof statusCode === 'number' && statusCode >= 500) ||
    message.includes('server error') ||
    message.includes('internal server error')
  ) {
    return 'docker_server_error'
  }

  if (
    message.includes('cannot connect to the docker daemon') ||
    message.includes('docker daemon') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('enoent') ||
    message.includes('socket hang up') ||
    message.includes('timeout')
  ) {
    return 'docker_unavailable'
  }

  return 'unknown'
}

export function toDockerOperationError(
  error: unknown,
  fallbackMessage: string
): DockerOperationError {
  if (error instanceof DockerOperationError) {
    return error
  }

  const reason = classifyDockerError(error)
  const statusCode = getStatusCode(error)
  const message = getDockerErrorMessage(error) || fallbackMessage
  return new DockerOperationError(message, reason, statusCode)
}
