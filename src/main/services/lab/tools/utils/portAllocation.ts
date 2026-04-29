/**
 * 端口分配工具
 * 用于管理实验室容器的端口映射和分配
 */

import { labService } from '../../LabService'
import { logger } from '@main/services/logger'
import { PortMapping } from '@shared/types/lab'

/**
 * 端口分配基础偏移量
 * 宿主机端口 = 容器端口 + HOST_PORT_BASE
 * 例如：容器端口 3306 -> 宿主机端口 33306
 */
export const HOST_PORT_BASE = 30000

/**
 * 计算首选宿主机端口
 * 将容器端口映射到稳定高位端口，避免与本机常见开发端口冲突
 */
export function getPreferredHostPort(containerPort: number): number {
  const preferredHostPort = containerPort + HOST_PORT_BASE
  if (preferredHostPort <= 65535) {
    return preferredHostPort
  }
  return Math.min(Math.max(containerPort, 1024), 65535)
}

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
 * 分配固定宿主机端口，避免端口冲突
 * @param preferredPort 首选端口
 * @returns 可用的宿主机端口
 */
export async function allocateFixedHostPort(preferredPort: number): Promise<number> {
  // 收集所有已有实验室的端口映射
  const reservedPorts = new Set<number>()

  const allLabs = labService.loadAllLabs()
  for (const lab of allLabs) {
    // 收集前端实验室的端口
    if (lab.frontend?.hostPort) {
      reservedPorts.add(lab.frontend.hostPort)
    }
    // 收集通用端口映射
    if (lab.portMappings) {
      for (const mapping of lab.portMappings) {
        if (mapping.hostPort) {
          reservedPorts.add(mapping.hostPort)
        }
      }
    }
  }

  // 从首选端口开始逐一检测
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

/**
 * 为端口列表分配固定宿主机端口
 */
export async function allocatePortMappings(
  ports: Array<{ containerPort: number; protocol: 'tcp' | 'udp' }>
): Promise<PortMapping[]> {
  const portMappings: PortMapping[] = []

  for (const port of ports) {
    const preferredPort = getPreferredHostPort(port.containerPort)
    const hostPort = await allocateFixedHostPort(preferredPort)

    portMappings.push({
      hostPort,
      containerPort: port.containerPort,
      protocol: port.protocol
    })

    logger.info('分配端口映射', 'main', {
      containerPort: port.containerPort,
      hostPort,
      protocol: port.protocol
    })
  }

  return portMappings
}
