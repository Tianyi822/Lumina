import { useCallback, useMemo } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { uploadAndRenderPdf } from '@renderer/stores/paper'
import { useKnowledgeStore } from '@renderer/stores'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import type { UIStateStore, ViewMode } from '@renderer/stores/uiStateStore'
import WorkspaceToolbar from '@renderer/components/chrome/WorkspaceToolbar'
import styles from './PrimarySidebar.module.css'

const ICON_SIZE = 18
const EXPAND_ICON_SIZE = 11

type NavItemId = 'read' | 'knowledge' | 'lab'

interface NavItem {
  id: NavItemId
  icon: string
  label: string
  view: ViewMode
  showTooltip: boolean
}

const ADD_LABEL_BY_VIEW: Record<ViewMode, string> = {
  paper: '添加论文',
  knowledge: '新增知识库',
  lab: '新增实验室'
}

/** 一级侧边栏导航项（不含添加） */
const TOP_NAV_ITEMS: NavItem[] = [
  { id: 'read', icon: 'read', label: '阅读', view: 'paper', showTooltip: true },
  { id: 'knowledge', icon: 'knowledge', label: '知识库', view: 'knowledge', showTooltip: true },
  { id: 'lab', icon: 'lab', label: '实验室', view: 'lab', showTooltip: true }
]

const BOTTOM_NAV_ITEM = { id: 'settings', icon: 'settings', label: '设置' } as const

interface PrimarySidebarProps {
  onOpenSettings?: () => void
}

function selectIsSecondarySidebarCollapsed(state: UIStateStore): boolean {
  if (state.currentView === 'paper') return state.paperSidebarCollapsed
  if (state.currentView === 'knowledge') return state.knowledgeSidebarCollapsed
  return state.labSidebarCollapsed
}

export default function PrimarySidebar({ onOpenSettings }: PrimarySidebarProps) {
  const currentView = useUIStateStore((s) => s.currentView)
  const setCurrentView = useUIStateStore((s) => s.setCurrentView)
  const toggleCurrentSidebar = useUIStateStore((s) => s.toggleCurrentSidebar)
  const isSecondarySidebarCollapsed = useUIStateStore(selectIsSecondarySidebarCollapsed)
  const currentTheme = useUIStateStore((s) => s.currentTheme)
  const themeMode = useUIStateStore((s) => s.themeMode)
  const setTheme = useUIStateStore((s) => s.setTheme)
  const setThemeMode = useUIStateStore((s) => s.setThemeMode)
  const openCreateForm = useKnowledgeStore((s) => s.openCreateForm)
  const openLabCreator = useUIStateStore((s) => s.openLabCreator)

  const isDarkTheme = currentTheme === 'lumina-dark'

  const addTooltip = ADD_LABEL_BY_VIEW[currentView]

  const navItems = useMemo(
    () =>
      TOP_NAV_ITEMS.map((item) => ({
        ...item,
        tooltip: item.showTooltip ? item.label : undefined
      })),
    []
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

  const handleExpandToggle = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>): void => {
      event.stopPropagation()
      toggleCurrentSidebar()
    },
    [toggleCurrentSidebar]
  )

  const handleNavClick = (item: NavItem): void => {
    void setCurrentView(item.view)
  }

  const applyTheme = useCallback(
    (themeId: 'lumina-light' | 'lumina-dark'): void => {
      if (themeMode === 'system') {
        void setThemeMode('manual').then(() => setTheme(themeId))
        return
      }
      if (currentTheme === themeId) return
      void setTheme(themeId)
    },
    [currentTheme, themeMode, setTheme, setThemeMode]
  )

  return (
    <nav className={styles['sm-primary-sidebar']} aria-label="一级导航">
      <div className={styles['sm-primary-sidebar__main']}>
        <div className={styles['sm-primary-sidebar__add-slot']}>
          <div className={styles['sm-primary-sidebar__item-wrap']}>
            <button
              type="button"
              className={styles['sm-primary-sidebar__item']}
              aria-label={addTooltip}
              onClick={handleAddClick}
            >
              <SvgIcon name="add" size={ICON_SIZE} />
            </button>
            <span className={styles['sm-primary-sidebar__tooltip']} role="tooltip">
              {addTooltip}
            </span>
          </div>
          <button
            type="button"
            className={[
              styles['sm-primary-sidebar__expand-toggle'],
              !isSecondarySidebarCollapsed && styles['sm-primary-sidebar__expand-toggle--expanded']
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={isSecondarySidebarCollapsed ? '展开二级侧边栏' : '收起二级侧边栏'}
            aria-expanded={!isSecondarySidebarCollapsed}
            onClick={handleExpandToggle}
          >
            <SvgIcon name="sidebar-expand" size={EXPAND_ICON_SIZE} />
          </button>
        </div>

        {navItems.map((item) => {
          const isActive = item.view === currentView
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
                aria-label={tooltip ?? item.label}
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
        <WorkspaceToolbar />

        <div
          className={[
            styles['sm-primary-sidebar__item-wrap'],
            styles['sm-primary-sidebar__footer-theme']
          ].join(' ')}
        >
          <div
            className={[
              styles['sm-primary-sidebar__theme-switch'],
              isDarkTheme && styles['sm-primary-sidebar__theme-switch--dark']
            ]
              .filter(Boolean)
              .join(' ')}
            role="group"
            aria-label="主题切换"
          >
            <span className={styles['sm-primary-sidebar__theme-switch-thumb']} aria-hidden="true" />
            <button
              type="button"
              className={styles['sm-primary-sidebar__theme-switch-option']}
              aria-label="浅色主题"
              aria-pressed={!isDarkTheme}
              onClick={() => applyTheme('lumina-light')}
            >
              <SvgIcon name="theme-light" size={ICON_SIZE} />
            </button>
            <button
              type="button"
              className={styles['sm-primary-sidebar__theme-switch-option']}
              aria-label="深色主题"
              aria-pressed={isDarkTheme}
              onClick={() => applyTheme('lumina-dark')}
            >
              <SvgIcon name="theme-dark" size={ICON_SIZE} />
            </button>
          </div>
          <span className={styles['sm-primary-sidebar__tooltip']} role="tooltip">
            {isDarkTheme ? '深色主题' : '浅色主题'}
          </span>
        </div>

        <div className={styles['sm-primary-sidebar__footer-divider']}>
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
      </div>
    </nav>
  )
}
