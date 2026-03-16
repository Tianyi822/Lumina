import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { PortMapping } from './types'

export const usePortMappingStore = defineStore('sandboxPortMapping', () => {
  /** 端口映射列表 */
  const portMappings = ref<PortMapping[]>([])

  /** 更新端口映射 */
  function updatePortMapping(index: number, mapping: Partial<PortMapping>): void {
    if (index >= 0 && index < portMappings.value.length) {
      portMappings.value[index] = { ...portMappings.value[index], ...mapping }
    }
  }

  /** 添加端口映射 */
  function addPortMapping(): void {
    portMappings.value.push({
      hostPort: null,
      containerPort: 80,
      protocol: 'tcp',
      editable: true
    })
  }

  /** 删除端口映射 */
  function removePortMapping(index: number): void {
    if (index >= 0 && index < portMappings.value.length) {
      portMappings.value.splice(index, 1)
    }
  }

  /**
   * 从 Dockerfile 内容解析 EXPOSE 指令
   */
  function parseDockerfilePorts(content: string): PortMapping[] {
    const ports: PortMapping[] = []
    if (!content) return ports

    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      // 匹配 EXPOSE 指令（忽略大小写）
      if (trimmed.toUpperCase().startsWith('EXPOSE')) {
        const exposeContent = trimmed.slice(6).trim()
        // 支持多种格式: EXPOSE 3306, EXPOSE 3306/tcp, EXPOSE 3306 3307, EXPOSE 3306/tcp 3307/udp
        const portStrings = exposeContent.split(/\s+/)

        for (const portStr of portStrings) {
          const match = portStr.match(/^(\d+)(?:\/(tcp|udp))?$/i)
          if (match) {
            const containerPort = parseInt(match[1], 10)
            ports.push({
              hostPort: containerPort, // 宿主机端口预选为与容器端口相同的值
              containerPort,
              protocol: (match[2]?.toLowerCase() as 'tcp' | 'udp') || 'tcp',
              editable: true
            })
          }
        }
      }
    }

    return ports
  }

  /**
   * 从 docker-compose.yaml 内容解析 ports 配置
   */
  function parseComposePorts(content: string): PortMapping[] {
    const ports: PortMapping[] = []

    try {
      // 简单的 YAML 端口解析（不依赖 YAML 解析库）
      const lines = content.split('\n')
      let inPortsSection = false
      let currentIndent = 0

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        // 检测 ports: 开始
        if (trimmed === 'ports:') {
          inPortsSection = true
          currentIndent = line.search(/\S/)
          continue
        }

        // 如果在 ports 部分
        if (inPortsSection) {
          const lineIndent = line.search(/\S/)

          // 如果缩进减少，说明离开了 ports 部分
          if (lineIndent <= currentIndent && trimmed && !trimmed.startsWith('-')) {
            inPortsSection = false
            continue
          }

          // 解析端口映射行
          if (trimmed.startsWith('-')) {
            const portStr = trimmed.slice(1).trim().replace(/"/g, '')

            // 格式: HostPort:ContainerPort 或 HostPort:ContainerPort/Protocol
            // 也支持简写: ContainerPort（只有容器端口）
            if (portStr.includes(':')) {
              const match = portStr.match(/^(\d+)?:?(\d+)(?:\/(tcp|udp))?$/i)
              if (match) {
                ports.push({
                  hostPort: match[1] ? parseInt(match[1], 10) : null,
                  containerPort: parseInt(match[2], 10),
                  protocol: (match[3]?.toLowerCase() as 'tcp' | 'udp') || 'tcp',
                  editable: true
                })
              }
            } else {
              // 简写格式: ContainerPort 或 ContainerPort/Protocol
              const simpleMatch = portStr.match(/^(\d+)(?:\/(tcp|udp))?$/i)
              if (simpleMatch) {
                ports.push({
                  hostPort: null,
                  containerPort: parseInt(simpleMatch[1], 10),
                  protocol: (simpleMatch[2]?.toLowerCase() as 'tcp' | 'udp') || 'tcp',
                  editable: true
                })
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('解析 docker-compose 端口失败:', e)
    }

    return ports
  }

  function reset(): void {
    portMappings.value = []
  }

  return {
    portMappings,
    updatePortMapping,
    addPortMapping,
    removePortMapping,
    parseDockerfilePorts,
    parseComposePorts,
    reset
  }
})
