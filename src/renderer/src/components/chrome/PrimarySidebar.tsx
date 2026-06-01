import { useCallback, useMemo } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { uploadAndRenderPdf } from '@renderer/stores/paper'
import { useKnowledgeStore } from '@renderer/stores'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import type { ViewMode } from '@renderer/stores/uiStateStore'
import styles from './PrimarySidebar.module.css'

const ICON_SIZE = 18

type NavItemId = 'add' | 'read' | 'knowledge' | 'lab'

interface NavItem {
  id: NavItemId
  icon: string
  label?: string
  view?: ViewMode
  showTooltip: boolean
  dynamicLabel?: boolean
}

const ADD_LABEL_BY_VIEW: Record<ViewMode, string> = {
  paper: '添加论文',
  knowledge: '新增知识库',
  lab: '新增实验室'
}

/** 一级侧边栏导航项 */
const TOP_NAV_ITEMS: NavItem[] = [
  { id: 'add', icon: 'add', showTooltip: true, dynamicLabel: true },
  { id: 'read', icon: 'read', label: '阅读', view: 'paper', showTooltip: true },
  { id: 'knowledge', icon: 'knowledge', label: '知识库', view: 'knowledge', showTooltip: true },
  { id: 'lab', icon: 'lab', label: '实验室', view: 'lab', showTooltip: true }
]

const BOTTOM_NAV_ITEM = { id: 'settings', icon: 'settings', label: '设置' } as const

interface PrimarySidebarProps {
  onOpenSettings?: () => void
}

function resolveNavLabel(item: NavItem, currentView: ViewMode): string | undefined {
  if (item.dynamicLabel) return ADD_LABEL_BY_VIEW[currentView]
  return item.label
}

export default function PrimarySidebar({ onOpenSettings }: PrimarySidebarProps) {
  const currentView = useUIStateStore((s) => s.currentView)
  const setCurrentView = useUIStateStore((s) => s.setCurrentView)
  const openCreateForm = useKnowledgeStore((s) => s.openCreateForm)
  const openLabCreator = useUIStateStore((s) => s.openLabCreator)

  const navItems = useMemo(
    () =>
      TOP_NAV_ITEMS.map((item) => ({
        ...item,
        tooltip: item.showTooltip ? resolveNavLabel(item, currentView) : undefined
      })),
    [currentView]
  )

  const handleAddClick = useCallback((): void => {
    if (currentView === 'paper') {
      void uploadAndRenderPdf()
      return
    }
    if (currentView === 'knowledge') {
      openCreateForm()
      return
    }
    openLabCreator()
  }, [currentView, openCreateForm, openLabCreator])

  const handleNavClick = (item: NavItem): void => {
    if (item.id === 'add') {
      handleAddClick()
      return
    }
    if (item.view) {
      void setCurrentView(item.view)
    }
  }

  return (
    <nav className={styles['sm-primary-sidebar']} aria-label="一级导航">
      <div className={styles['sm-primary-sidebar__main']}>
        {navItems.map((item) => {
          const isActive = item.view != null && item.view === currentView
          const tooltip = item.tooltip

          return (
            <div key={item.id} className={styles['sm-primary-sidebar__item-wrap']}>
              <button
                type="button"
                className={[
                  styles['sm-primary-sidebar__item'],
                  isActive && styles['sm-primary-sidebar__item--active']
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={tooltip ?? item.label ?? item.id}
                onClick={() => handleNavClick(item)}
              >
                <SvgIcon name={item.icon} size={ICON_SIZE} />
              </button>
              {tooltip ? (
                <span className={styles['sm-primary-sidebar__tooltip']} role="tooltip">
                  {tooltip}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className={styles['sm-primary-sidebar__footer']}>
        <div className={styles['sm-primary-sidebar__item-wrap']}>
          <button
            type="button"
            className={styles['sm-primary-sidebar__item']}
            aria-label={BOTTOM_NAV_ITEM.label}
            onClick={onOpenSettings}
          >
            <SvgIcon name={BOTTOM_NAV_ITEM.icon} size={ICON_SIZE} />
          </button>
        </div>
      </div>
    </nav>
  )
}
