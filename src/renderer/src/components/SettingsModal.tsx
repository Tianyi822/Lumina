import { useState, useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@renderer/stores'
import ThemeSettings from './settings/ThemeSettings'
import ModelSettings from './settings/ModelSettings'
import MCPSettings from './settings/MCPSettings'
import EmbeddingModelSettings from './settings/EmbeddingModelSettings'
import KnowledgeMCPSettings from './settings/KnowledgeMCPSettings'
import PaperReaderSettings from './settings/PaperReaderSettings'
import ToolStatsSettings from './settings/ToolStatsSettings'
import UpdateSettings from './settings/UpdateSettings'
import styles from './SettingsModal.module.css'

type SettingsTabKey =
  | 'model'
  | 'embedding'
  | 'paperReader'
  | 'mcp'
  | 'knowledge'
  | 'toolStats'
  | 'theme'
  | 'update'

interface SettingsModalProps {
  onClose: () => void
}

const settingsTabs: Array<{ id: SettingsTabKey; label: string; description: string }> = [
  { id: 'model', label: '对话模型配置', description: '管理默认模型、接口地址与上下文参数。' },
  { id: 'embedding', label: '嵌入模型配置', description: '维护知识检索所需的向量模型清单。' },
  { id: 'paperReader', label: '论文阅读配置', description: '配置论文 OCR 识别服务与翻译模型。' },
  { id: 'mcp', label: 'MCP 服务', description: '连接外部工具链并管理服务传输方式。' },
  { id: 'knowledge', label: '知识库服务', description: '管理知识库 MCP 对外服务与共享说明。' },
  { id: 'toolStats', label: '工具调用统计', description: '查看工具调用量、成功率和耗时分布。' },
  { id: 'theme', label: '主题设置', description: '切换当前工作主题并查看主题预览。' },
  { id: 'update', label: '升级版本', description: '检查应用更新并查看版本历史。' }
]

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabKey>('model')

  const configLoading = useConfigStore((s) => s.loading)
  const configState = useConfigStore((s) => ({
    themeConfig: s.themeConfig
  }))
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
              {settingsTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={['sm-settings-nav__item', activeTab === tab.id && 'is-active']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="sm-settings-nav__label">{tab.label}</span>
                  <span className="sm-settings-nav__meta">{tab.description}</span>
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
                  {activeTab === 'model' && <ModelSettings />}
                  {activeTab === 'mcp' && <MCPSettings />}
                  {activeTab === 'embedding' && <EmbeddingModelSettings />}
                  {activeTab === 'theme' && (
                    <ThemeSettings
                      value={configState.themeConfig}
                      onThemeChange={handleThemeChange}
                    />
                  )}
                  {activeTab === 'knowledge' && <KnowledgeMCPSettings />}
                  {activeTab === 'toolStats' && <ToolStatsSettings />}
                  {activeTab === 'paperReader' && <PaperReaderSettings />}
                  {activeTab === 'update' && <UpdateSettings />}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
