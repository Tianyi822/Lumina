import InteractiveTerminalPanel from './InteractiveTerminalPanel'
import TerminalPanel from './TerminalPanel'
import type { ContainerDetails, LabData, TerminalLog } from '@renderer/types/lab'

interface LabTerminalTabProps {
  isSshLab: boolean
  isDockerReady: boolean
  currentLab: LabData | null
  selectedContainer: ContainerDetails | null
  isSshConnected: boolean
  labDetailTab: string
  terminalLogs?: TerminalLog[]
  terminalLoading?: boolean
  onExecuteCommand?: (command: string) => void
  onClearTerminal?: () => void
}

export default function LabTerminalTab({
  isSshLab,
  isDockerReady,
  currentLab,
  selectedContainer,
  terminalLogs = [],
  terminalLoading,
  onExecuteCommand,
  onClearTerminal
}: LabTerminalTabProps) {
  if (isSshLab) {
    if (!currentLab) return null

    return (
      <InteractiveTerminalPanel
        backend="ssh"
        targetId={currentLab.labId}
        title={currentLab.name}
        subtitle={currentLab.ssh ? `${currentLab.ssh.host}:${currentLab.ssh.port}` : undefined}
      />
    )
  }

  if (!isDockerReady || !selectedContainer) {
    return (
      <div style={{ padding: '1rem', color: 'var(--sm-color-text-secondary)' }}>
        请先在监控 Tab 中选择一个容器
      </div>
    )
  }

  return (
    <TerminalPanel
      containerId={selectedContainer.id}
      containerName={selectedContainer.names?.[0] || selectedContainer.id}
      logs={terminalLogs || []}
      loading={terminalLoading}
      onExecute={(cmd) => onExecuteCommand?.(cmd)}
      onClear={() => onClearTerminal?.()}
    />
  )
}
