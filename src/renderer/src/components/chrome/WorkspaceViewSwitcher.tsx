import { useUIStateStore, type ViewMode } from '@renderer/stores/uiStateStore'
import styles from './WorkspaceViewSwitcher.module.css'

const TABS: { view: ViewMode; label: string }[] = [
  { view: 'paper', label: '论文' },
  { view: 'knowledge', label: '知识库' },
  { view: 'lab', label: '实验室' }
]

export default function WorkspaceViewSwitcher() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isKnowledgeView = useUIStateStore((s) => s.isKnowledgeView())
  const isLabView = useUIStateStore((s) => s.isLabView())
  const isPaperView = useUIStateStore((s) => s.isPaperView())
  const setCurrentView = useUIStateStore((s) => s.setCurrentView)

  async function switchView(view: ViewMode): Promise<void> {
    if (currentView !== view) {
      await setCurrentView(view)
    }
  }

  const viewFlags: Record<ViewMode, boolean> = {
    paper: isPaperView,
    knowledge: isKnowledgeView,
    lab: isLabView
  }

  return (
    <div className={styles['sm-view-switcher']} role="tablist" aria-label="工作区切换">
      {TABS.map(({ view, label }) => (
        <button
          key={view}
          className={[styles['sm-view-switcher__button'], viewFlags[view] && styles['is-active']]
            .filter(Boolean)
            .join(' ')}
          aria-selected={viewFlags[view]}
          onClick={() => switchView(view)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
