import { useState } from 'react'
import ContainerLogs from './ContainerLogs'
import LabDetailEmptyState from './LabDetailEmptyState'

interface LabLogsTabProps {
  isDockerReady: boolean
  selectedContainerId?: string
}

export default function LabLogsTab({ isDockerReady, selectedContainerId }: LabLogsTabProps) {
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  if (!isDockerReady) {
    return (
      <LabDetailEmptyState
        title="Docker 未就绪"
        message="本地 Docker 运行时不可用，容器日志功能暂时无法使用。"
      />
    )
  }

  async function handleRefresh(): Promise<void> {
    if (!selectedContainerId) return
    setLoading(true)
    try {
      const result = await window.api.lab.getContainerLogs(selectedContainerId)
      if (result.success && result.logs) {
        setLogs(result.logs.split('\n'))
      } else {
        setLogs([])
      }
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
