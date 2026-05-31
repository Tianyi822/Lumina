import type { LabService } from '../LabService'
import { FRONTEND_HOST_PORT_BASE } from './constants'

/**
 * 检查宿主机端口是否可用
 */
export async function isHostPortAvailable(port: number): Promise<boolean> {
  const net = await import('node:net')

  return new Promise((resolve) => {
    const server = net.createServer()

    const finish = (available: boolean): void => {
      server.removeAllListeners()
      resolve(available)
    }

    server.once('error', () => finish(false))
    server.once('listening', () => {
      server.close(() => finish(true))
    })
    server.listen(port, '0.0.0.0')
  })
}

/**
 * 将容器开发端口映射到宿主机的稳定高位端口，避免与本机常见开发端口冲突
 */
export function getPreferredHostPort(containerPort: number): number {
  const preferredHostPort = containerPort + FRONTEND_HOST_PORT_BASE
  if (preferredHostPort <= 65535) {
    return preferredHostPort
  }

  return Math.min(Math.max(containerPort, 1024), 65535)
}

/**
 * 为前端实验室分配固定宿主机端口，避免 stop/start 或 restart 后随机变化
 */
export async function allocateFixedHostPort(
  preferredPort: number,
  labService: LabService,
  ignoredLabId?: string
): Promise<number> {
  const reservedPorts = new Set(
    (await labService.loadAllLabs())
      .filter((lab) => lab.labId !== ignoredLabId)
      .map((lab) => lab.frontend?.hostPort)
      .filter(
        (port): port is number => typeof port === 'number' && Number.isInteger(port) && port > 0
      )
  )

  for (let port = preferredPort; port <= 65535; port += 1) {
    if (reservedPorts.has(port)) {
      continue
    }

    if (await isHostPortAvailable(port)) {
      return port
    }
  }

  throw new Error('未找到可用的宿主机端口')
}

export async function getReusableHostPort(
  preferredPort: number,
  labId: string,
  labService: LabService
): Promise<number> {
  if (await isHostPortAvailable(preferredPort)) {
    return preferredPort
  }

  return allocateFixedHostPort(preferredPort, labService, labId)
}

/**
 * 构建预览地址
 */
export function buildPreviewUrl(hostPort: number): string {
  return `http://127.0.0.1:${hostPort}`
}
