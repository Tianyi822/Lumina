import ContainerDetailPanel from './ContainerDetailPanel'
import LabDetailEmptyState from './LabDetailEmptyState'
import SshServerMonitorPanel from './SshServerMonitorPanel'
import type { ContainerDetails, ContainerStats, LabData } from '@renderer/types/lab'

interface LabStatsTabProps {
  isSshLab: boolean
  isDockerReady: boolean
  isStatsTabActive: boolean
  currentLab: LabData | null
  selectedContainer: ContainerDetails | null
  containerStats: ContainerStats | null
  storeLoading: boolean
  isManualRefreshingStats: boolean
  startingContainer: boolean
  stoppingContainer: boolean
  restartingContainer: boolean
  creationType?: LabData['creationType']
  labName?: string
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onRemove: () => void
  onOpenTerminal: () => void
  onViewLogs: () => void
  onRefreshStats: () => void
}

export default function LabStatsTab(props: LabStatsTabProps) {
  if (props.isSshLab) {
    return props.currentLab ? (
      <SshServerMonitorPanel
        labId={props.currentLab.labId}
        connected={props.currentLab.status === 'running'}
        active={props.isStatsTabActive}
      />
    ) : null
  }

  if (!props.isDockerReady) {
    return (
      <LabDetailEmptyState
        title="Docker 未就绪"
        message="本地 Docker 运行时不可用，容器监控功能暂时无法使用。"
      />
    )
  }

  if (!props.selectedContainer) {
    return (
      <LabDetailEmptyState
        title="请先选择一个容器"
        message="选中主容器后，这里会显示运行指标、端口映射和环境细节。"
      />
    )
  }

  return (
    <ContainerDetailPanel
      container={props.selectedContainer}
      stats={props.containerStats}
      loading={props.storeLoading}
      refreshingStats={props.isManualRefreshingStats}
      creationType={props.creationType}
      startingContainer={props.startingContainer}
      stoppingContainer={props.stoppingContainer}
      restartingContainer={props.restartingContainer}
      onStart={props.onStart}
      onStop={props.onStop}
      onRestart={props.onRestart}
      onRemove={props.onRemove}
      onOpenTerminal={props.onOpenTerminal}
      onViewLogs={props.onViewLogs}
      onRefreshStats={props.onRefreshStats}
    />
  )
}
