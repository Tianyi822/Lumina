import { create } from 'zustand'
import type { PortMapping } from './types'

interface PortMappingState {
  portMappings: PortMapping[]
  updatePortMapping: (index: number, mapping: Partial<PortMapping>) => void
  addPortMapping: () => void
  removePortMapping: (index: number) => void
  parseDockerfilePorts: (content: string) => PortMapping[]
  parseComposePorts: (content: string) => PortMapping[]
  reset: () => void
}

export const usePortMappingStore = create<PortMappingState>()((set) => ({
  portMappings: [],

  updatePortMapping: (index, mapping) =>
    set((state) => {
      if (index < 0 || index >= state.portMappings.length) return {}
      const next = [...state.portMappings]
      next[index] = { ...next[index], ...mapping }
      return { portMappings: next }
    }),

  addPortMapping: () =>
    set((state) => ({
      portMappings: [
        ...state.portMappings,
        { hostPort: null, containerPort: 80, protocol: 'tcp', editable: true }
      ]
    })),

  removePortMapping: (index) =>
    set((state) => {
      if (index < 0 || index >= state.portMappings.length) return {}
      return { portMappings: state.portMappings.filter((_, i) => i !== index) }
    }),

  parseDockerfilePorts: (content) => {
    const ports: PortMapping[] = []
    if (!content) return ports

    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.toUpperCase().startsWith('EXPOSE')) {
        const exposeContent = trimmed.slice(6).trim()
        const portStrings = exposeContent.split(/\s+/)

        for (const portStr of portStrings) {
          const match = portStr.match(/^(\d+)(?:\/(tcp|udp))?$/i)
          if (match) {
            const containerPort = parseInt(match[1], 10)
            ports.push({
              hostPort: containerPort,
              containerPort,
              protocol: (match[2]?.toLowerCase() as 'tcp' | 'udp') || 'tcp',
              editable: true
            })
          }
        }
      }
    }

    return ports
  },

  parseComposePorts: (content) => {
    const ports: PortMapping[] = []

    try {
      const lines = content.split('\n')
      let inPortsSection = false
      let currentIndent = 0

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        if (trimmed === 'ports:') {
          inPortsSection = true
          currentIndent = line.search(/\S/)
          continue
        }

        if (inPortsSection) {
          const lineIndent = line.search(/\S/)
          if (lineIndent <= currentIndent && trimmed && !trimmed.startsWith('-')) {
            inPortsSection = false
            continue
          }

          if (trimmed.startsWith('-')) {
            const portStr = trimmed.slice(1).trim().replace(/"/g, '')

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
    } catch {
      // silent
    }

    return ports
  },

  reset: () => set({ portMappings: [] })
}))
