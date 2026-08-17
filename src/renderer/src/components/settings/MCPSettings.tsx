import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { MCPServerConfig } from '@shared/types/mcp'
import { useMCPStore } from '@renderer/stores/mcpStore'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import MCPServerItem from '../mcp/MCPServerItem'
import MCPNewServerForm from '../mcp/MCPNewServerForm'
import styles from './MCPSettings.module.css'

interface MCPSettingsProps {
  onMcpUpdated?: () => void
}

/** MCP 服务配置设置页：管理外部工具链连接，支持添加/编辑/删除/连接/断开/测试/JSON 导入 */
export default function MCPSettings({ onMcpUpdated }: MCPSettingsProps) {
  const { t } = useTranslation()

  // Zustand selectors
  const configs = useMCPStore((s) => s.configs)
  const expandedServers = useMCPStore((s) => s.expandedServers)
  const connecting = useMCPStore((s) => s.connecting)
  const testing = useMCPStore((s) => s.testing)

  // Store 方法
  const loadConfigs = useMCPStore((s) => s.loadConfigs)
  const setupStatusListener = useMCPStore((s) => s.setupStatusListener)
  const cleanupStatusListener = useMCPStore((s) => s.cleanupStatusListener)
  const toggleServerExpanded = useMCPStore((s) => s.toggleServerExpanded)
  const getStatus = useMCPStore((s) => s.getStatus)
  const connectStore = useMCPStore((s) => s.connect)
  const disconnectStore = useMCPStore((s) => s.disconnect)
  const testConnectionStore = useMCPStore((s) => s.testConnection)
  const saveConfigStore = useMCPStore((s) => s.saveConfig)
  const deleteConfigStore = useMCPStore((s) => s.deleteConfig)

  // UI 状态
  const [showNewMCPForm, setShowNewMCPForm] = useState(false)
  const [showImportPanel, setShowImportPanel] = useState(false)
  const [importJsonContent, setImportJsonContent] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  // 导入 JSON 示例
  const importPlaceholder = useMemo(() => t('settings.mcp.importPlaceholder'), [t])

  // 校验 MCP 配置
  const validateMCPConfig = useCallback((config: MCPServerConfig): string => {
    if (!config.name.trim()) return '请输入服务器名称'
    if (config.transport === 'stdio') {
      if (!config.command?.trim()) return `MCP 服务"${config.name}"的执行命令不能为空`
    } else if (!config.url?.trim()) {
      return `MCP 服务"${config.name}"的服务地址不能为空`
    }
    return ''
  }, [])

  // 现有服务器名称列表
  const existingNames = useMemo(() => configs.map((c) => c.name), [configs])

  // 切换展开状态
  const handleToggleExpand = useCallback(
    (name: string) => {
      toggleServerExpanded(name)
    },
    [toggleServerExpanded]
  )

  // 连接
  const handleConnect = useCallback(
    async (name: string) => {
      const success = await connectStore(
        name,
        (msg) => notifySuccess('MCP 服务', msg, { source: 'settings' }),
        (msg) => notifyError('MCP 服务', msg, { source: 'settings' })
      )
      if (success) {
        await loadConfigs()
        onMcpUpdated?.()
      }
    },
    [connectStore, loadConfigs, onMcpUpdated]
  )

  // 断开
  const handleDisconnect = useCallback(
    async (name: string) => {
      const success = await disconnectStore(name, (msg) =>
        notifyError('MCP 服务', msg, { source: 'settings' })
      )
      if (success) {
        await loadConfigs()
        onMcpUpdated?.()
      }
    },
    [disconnectStore, loadConfigs, onMcpUpdated]
  )

  // 测试连接
  const handleTest = useCallback(
    async (config: MCPServerConfig) => {
      const msg = validateMCPConfig(config)
      if (msg) {
        notifyError('MCP 服务', msg, { source: 'settings' })
        return
      }
      await testConnectionStore(
        config,
        (m) => notifySuccess('MCP 服务', m, { source: 'settings' }),
        (m) => notifyError('MCP 服务', m, { source: 'settings' })
      )
    },
    [validateMCPConfig, testConnectionStore]
  )

  // 删除配置
  const handleDelete = useCallback(
    async (name: string) => {
      const success = await deleteConfigStore(name)
      if (success) {
        onMcpUpdated?.()
      }
    },
    [deleteConfigStore, onMcpUpdated]
  )

  // 保存配置（编辑已有服务器）
  const handleSave = useCallback(
    async (config: MCPServerConfig): Promise<boolean> => {
      const msg = validateMCPConfig(config)
      if (msg) {
        notifyError('MCP 服务', msg, { source: 'settings' })
        return false
      }
      const success = await saveConfigStore(config)
      if (success) {
        onMcpUpdated?.()
      }
      return success
    },
    [validateMCPConfig, saveConfigStore, onMcpUpdated]
  )

  // 添加新服务器
  const handleAddNew = useCallback(
    async (config: MCPServerConfig) => {
      const msg = validateMCPConfig(config)
      if (msg) {
        notifyError('MCP 服务', msg, { source: 'settings' })
        return
      }
      const success = await saveConfigStore(config)
      if (success) {
        setShowNewMCPForm(false)
        onMcpUpdated?.()
      }
    },
    [validateMCPConfig, saveConfigStore, onMcpUpdated]
  )

  // 切换导入面板
  const toggleImportPanel = useCallback(() => {
    setShowImportPanel((prev) => {
      if (prev) setImportJsonContent('')
      return !prev
    })
  }, [])

  // 导入 MCP 配置
  const importMCPConfigs = useCallback(async () => {
    const jsonContent = importJsonContent.trim()
    if (!jsonContent) {
      notifyError('MCP 服务', '请输入 MCP 配置 JSON', { source: 'settings' })
      return
    }

    setIsImporting(true)
    try {
      const result = await window.api.mcp.importConfigs(jsonContent)
      if (result.success) {
        notifySuccess('MCP 服务', `成功导入 ${result.imported} 个配置`, { source: 'settings' })
        if (result.errors.length > 0) {
          window.api.logger.warn('[MCPSettings] 导入过程中存在错误', { errors: result.errors })
        }
        setImportJsonContent('')
        setShowImportPanel(false)
        await loadConfigs()
        onMcpUpdated?.()
      } else {
        notifyError('MCP 服务', `导入失败: ${result.errors.join(', ')}`, { source: 'settings' })
      }
    } catch (error) {
      notifyError(
        'MCP 服务',
        `导入失败: ${error instanceof Error ? error.message : String(error)}`,
        { source: 'settings' }
      )
    } finally {
      setIsImporting(false)
    }
  }, [importJsonContent, loadConfigs, onMcpUpdated])

  // 组件挂载时加载配置并设置状态监听
  useEffect(() => {
    loadConfigs()
    setupStatusListener()
    return () => {
      cleanupStatusListener()
    }
  }, [loadConfigs, setupStatusListener, cleanupStatusListener])

  return (
    <div className={['sm-settings-page', 'tab-content'].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">{t('settings.mcp.title')}</h2>
        <p className="sm-settings-page__description">{t('settings.mcp.description')}</p>
      </header>

      <section className="sm-settings-page__section">
        <div className="sm-settings-page__section-header">
          <div>
            <h3 className="sm-settings-page__section-title">{t('settings.mcp.listTitle')}</h3>
            <p className="sm-settings-page__section-description">
              {t('settings.mcp.listDescription', { count: configs.length })}
            </p>
          </div>
        </div>

        <div className={styles['mcp-server-list']}>
          {configs.map((config) => (
            <MCPServerItem
              key={config.name}
              config={config}
              status={getStatus(config.name)}
              expanded={expandedServers.has(config.name)}
              connecting={connecting === config.name}
              testing={testing === config.name}
              onToggleExpand={() => handleToggleExpand(config.name)}
              onConnect={() => handleConnect(config.name)}
              onDisconnect={() => handleDisconnect(config.name)}
              onDelete={() => handleDelete(config.name)}
              onTest={handleTest}
              onSave={handleSave}
            />
          ))}

          {configs.length === 0 && !showNewMCPForm && (
            <div className="sm-settings-empty">
              <p>{t('settings.mcp.empty')}</p>
            </div>
          )}
        </div>

        {showNewMCPForm && (
          <MCPNewServerForm
            existingNames={existingNames}
            onSubmit={handleAddNew}
            onCancel={() => setShowNewMCPForm(false)}
            onTest={handleTest}
          />
        )}

        {!showNewMCPForm && (
          <div className={['sm-settings-actions', styles['settings-actions']].join(' ')}>
            <button
              className={['sm-button', styles['add-mcp-btn']].join(' ')}
              onClick={() => setShowNewMCPForm(true)}
            >
              {t('settings.mcp.addServer')}
            </button>
            <button
              className={['sm-button', styles['import-btn']].join(' ')}
              onClick={toggleImportPanel}
            >
              {showImportPanel ? t('settings.mcp.collapseImport') : t('settings.mcp.importJson')}
            </button>
          </div>
        )}

        {showImportPanel && !showNewMCPForm && (
          <div className={styles['import-panel']}>
            <label className={styles['import-label']} htmlFor="mcp-import-json">
              {t('settings.mcp.importLabel')}
            </label>
            <textarea
              id="mcp-import-json"
              className={['sm-textarea', styles['import-textarea']].join(' ')}
              placeholder={importPlaceholder}
              value={importJsonContent}
              onChange={(e) => setImportJsonContent(e.target.value)}
            />
            <div className={styles['import-actions']}>
              <button
                className="sm-button sm-button--small sm-button--primary"
                disabled={isImporting}
                onClick={importMCPConfigs}
              >
                {isImporting ? t('settings.mcp.importing') : t('settings.mcp.confirmImport')}
              </button>
              <button
                className="sm-button sm-button--small sm-button--secondary"
                disabled={isImporting}
                onClick={toggleImportPanel}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
