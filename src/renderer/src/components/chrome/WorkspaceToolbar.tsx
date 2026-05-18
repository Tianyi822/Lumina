import { useUIStateStore } from '@renderer/stores/uiStateStore'
import styles from './WorkspaceToolbar.module.css'

export default function WorkspaceToolbar() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())

  const isPaperView = currentView === 'paper'

  return (
    <div
      className={[
        styles['sm-workspace-toolbar__controls'],
        isPaperView && styles['sm-workspace-toolbar__controls--paper'],
        !isPaperView &&
          currentView === 'knowledge' &&
          styles['sm-workspace-toolbar__controls--knowledge'],
        isPaperView &&
          isCurrentSidebarCollapsed &&
          styles['sm-workspace-toolbar__controls--chrome-safe']
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* 论文工具栏功能将在 Phase 8 实现 */}
    </div>
  )
}
