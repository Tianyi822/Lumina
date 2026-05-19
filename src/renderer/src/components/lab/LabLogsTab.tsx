import { useState } from 'react'
import ContainerLogs from './ContainerLogs'

interface LabLogsTabProps {
  isDockerReady: boolean
  selectedContainerId?: string
}

export default function LabLogsTab({ isDockerReady, selectedContainerId }: LabLogsTabProps) {
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  if (!isDockerReady) {
    return (
      <div style={{ padding: '1rem', color: 'var(--sm-color-text-secondary)' }}>
        Docker 未就绪，日志功能暂不可用
      </div>
    )
  }

  async function handleRefresh(): Promise<void> {
    if (!selectedContainerId) return
    setLoading(true)
    try {
      const result = await window.api.lab.getContainerLogs(selectedContainerId)
      const data = result as unknown as string
      setLogs(data ? data.split('\n') : [])
    } finally {
      setLoading(false)
    }
  }

  return (
    <ContainerLogs
      logs={logs}
      loading={loading}
      onRefresh={handleRefresh}
      onClear={() => setLogs([])}
    />
  )
}
