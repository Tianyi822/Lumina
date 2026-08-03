import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useConfigStore } from '@renderer/stores'
import ThemeSettings from './settings/ThemeSettings'
import ModelSettings from './settings/ModelSettings'
import MCPSettings from './settings/MCPSettings'
import EmbeddingModelSettings from './settings/EmbeddingModelSettings'
import KnowledgeMCPSettings from './settings/KnowledgeMCPSettings'
import PaperReaderSettings from './settings/PaperReaderSettings'
import ToolStatsSettings from './settings/ToolStatsSettings'
import UpdateSettings from './settings/UpdateSettings'
import SyncSettings from './settings/SyncSettings'
import styles from './SettingsModal.module.css'

type SettingsTabKey =
  | 'model'
  | 'embedding'
  | 'paperReader'
  | 'mcp'
  | 'knowledge'
  | 'toolStats'
  | 'theme'
  | 'sync'
  | 'update'

type SettingsCategoryId = 'paper' | 'knowledge' | 'advanced' | 'theme' | 'sync' | 'update'

interface SettingsModalProps {
  onClose: () => void
  onMcpUpdated?: () => void
}

interface SettingsCategory {
  id: SettingsCategoryId
  label: string
  items: SettingsTabKey[]
}

const settingsCategories: SettingsCategory[] = [
  { id: 'paper', label: '论文阅读配置', items: ['model', 'paperReader'] },
  { id: 'knowledge', label: '知识库配置', items: ['embedding', 'knowledge'] },
  { id: 'advanced', label: '高级功能', items: ['mcp', 'toolStats'] },
  { id: 'theme', label: '主题设置', items: ['theme'] },
  { id: 'sync', label: '数据同步', items: ['sync'] },
  { id: 'update', label: '升级版本', items: ['update'] }
]

/** 设置弹窗组件：按类别分组设置项，支持导航分类和 ESC 关闭 */
function SettingsModal({ onClose, onMcpUpdated }: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>('paper')

  const configLoading = useConfigStore((s) => s.loading)
  const themeConfig = useConfigStore((s) => s.themeConfig)
  const loadConfig = useConfigStore((s) => s.loadConfig)

  const navRef = useRef<HTMLElement>(null)

  // Load config on mount
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Keyboard handler
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Scroll handling for nav
  const handleNavScroll = useCallback(() => {
    const el = navRef.current
    if (!el) return
    el.classList.add('is-scrolling')
    // Remove after 800ms
    setTimeout(() => {
      el?.classList.remove('is-scrolling')
    }, 800)
  }, [])

  function handleThemeChange(themeId: string): void {
    window.api.logger.info('[SettingsModal] 主题已切换', { themeId })
  }

  return (
    <div
      className={['sm-modal__overlay', styles['settings-overlay']].join(' ')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={['sm-modal__surface', styles['settings-container']].join(' ')}>
        <div className={['sm-pane-header', styles['settings-header']].join(' ')}>
          <div className={styles['settings-header__info']}>
            <h2 className={styles['settings-title']}>设置中心</h2>
          </div>
          <button className={['sm-button', styles['close-btn']].join(' ')} onClick={onClose}>
            关闭
          </button>
        </div>

        <div className={['sm-settings-layout', styles['settings-body']].join(' ')}>
          <aside ref={navRef} className="sm-settings-nav settings-nav" onScroll={handleNavScroll}>
            <div className="sm-settings-nav__list">
              {settingsCategories.map((cat) => (
                <button
                  key={cat.id}
                  className={['sm-settings-nav__item', activeCategory === cat.id && 'is-active']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <span className="sm-settings-nav__label">{cat.label}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="sm-settings-panel settings-panel">
            <div className={['sm-settings-panel__body', styles['settings-content']].join(' ')}>
              {configLoading ? (
                <div className="sm-settings-empty">正在加载当前配置...</div>
              ) : (
                <>
                  {(() => {
                    const category = settingsCategories.find((c) => c.id === activeCategory)
                    if (!category) return null
                    return category.items.map((tabKey) => {
                      switch (tabKey) {
                        case 'model':
                          return <ModelSettings key="model" />
                        case 'mcp':
                          return <MCPSettings key="mcp" onMcpUpdated={onMcpUpdated} />
                        case 'embedding':
                          return <EmbeddingModelSettings key="embedding" />
                        case 'theme':
                          return (
                            <ThemeSettings
                              key="theme"
                              value={themeConfig}
                              onThemeChange={handleThemeChange}
                            />
                          )
                        case 'knowledge':
                          return <KnowledgeMCPSettings key="knowledge" />
                        case 'toolStats':
                          return <ToolStatsSettings key="toolStats" />
                        case 'paperReader':
                          return <PaperReaderSettings key="paperReader" />
                        case 'update':
                          return <UpdateSettings key="update" />
                        case 'sync':
                          return <SyncSettings key="sync" />
                        default:
                          return null
                      }
                    })
                  })()}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default memo(SettingsModal)
