import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { MCPServerConfig, MCPConnectionStatus, MCPTransportType } from '@shared/types/mcp'
import KeyValueEditor from './KeyValueEditor'
import styles from './MCPServerItem.module.css'

interface MCPServerItemProps {
  config: MCPServerConfig
  status?: MCPConnectionStatus
  expanded: boolean
  connecting: boolean
  testing: boolean
  onToggleExpand: () => void
  onConnect: () => void
  onDisconnect: () => void
  onDelete: () => void
  onTest: (config: MCPServerConfig) => void
  onSave: (config: MCPServerConfig) => void
}

/** MCP 服务器配置项：内联编辑、传输类型切换，使用 localConfig 管理编辑状态，失焦时保存 */
export default function MCPServerItem({
  config,
  status,
  expanded,
  connecting,
  testing,
  onToggleExpand,
  onConnect,
  onDisconnect,
  onDelete,
  onTest,
  onSave
}: MCPServerItemProps) {
  const { t } = useTranslation()
  const [localConfig, setLocalConfig] = useState<MCPServerConfig>({ ...config })
  const [argsText, setArgsText] = useState((config.args || []).join('\n'))
  const [warningMessage, setWarningMessage] = useState('')

  // 同步 props.config → localConfig
  useEffect(() => {
    setLocalConfig({
      ...config,
      command: config.command || '',
      args: [...(config.args || [])],
      env: { ...(config.env || {}) },
      url: config.url || '',
      headers: { ...(config.headers || {}) }
    })
    setArgsText((config.args || []).join('\n'))
  }, [config])

  // 构建待保存的配置（清除不相关字段）
  const buildConfigToSave = useCallback((): MCPServerConfig => {
    const isStdio = localConfig.transport === 'stdio'
    return {
      ...localConfig,
      name: localConfig.name.trim(),
      command: isStdio ? localConfig.command?.trim() || '' : '',
      args: isStdio
        ? argsText
            .split('\n')
            .map((item) => item.trim())
            .filter((item) => item)
        : [],
      env: isStdio ? { ...(localConfig.env || {}) } : {},
      url: isStdio ? '' : localConfig.url?.trim() || '',
      headers: isStdio ? {} : { ...(localConfig.headers || {}) }
    }
  }, [localConfig, argsText])

  // 校验配置
  const validateConfig = useCallback(
    (cfg: MCPServerConfig): string => {
      if (!cfg.name) return t('settings.mcp.validation.nameRequired')
      if (cfg.transport === 'stdio') {
        if (!cfg.command) return t('settings.mcp.validation.commandRequired', { name: cfg.name })
      } else if (!cfg.url) {
        return t('settings.mcp.validation.urlRequired', { name: cfg.name })
      }
      return ''
    },
    [t]
  )

  // 持久化配置（失焦保存）
  const persistConfig = useCallback(() => {
    const cfg = buildConfigToSave()
    const msg = validateConfig(cfg)
    if (msg) {
      setWarningMessage(msg)
      return
    }
    setWarningMessage('')
    onSave(cfg)
  }, [buildConfigToSave, validateConfig, onSave])

  // 更新配置字段
  const updateConfig = useCallback((updates: Partial<MCPServerConfig>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }))
  }, [])

  // 切换传输类型（清除不相关字段）
  const updateTransport = useCallback(
    (value: string) => {
      const transport = value as MCPTransportType
      if (transport === 'stdio') {
        updateConfig({ transport, url: '', headers: {} })
      } else if (localConfig.transport === 'stdio') {
        updateConfig({ transport, command: '', args: [], env: {} })
        setArgsText('')
      } else {
        updateConfig({ transport })
      }
      setWarningMessage('')
    },
    [localConfig.transport, updateConfig]
  )

  // 参数失焦处理
  const handleArgsBlur = useCallback(() => {
    const parsedArgs = argsText
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item)
    setLocalConfig((prev) => ({ ...prev, args: parsedArgs }))
    persistConfig()
  }, [argsText, persistConfig])

  // 环境变量变更
  const handleEnvChange = useCallback(
    (value: Record<string, string>) => {
      updateConfig({ env: value || {} })
      // 延迟保存，让 React 先更新 localConfig
      setTimeout(() => persistConfig(), 0)
    },
    [updateConfig, persistConfig]
  )

  // 请求头变更
  const handleHeadersChange = useCallback(
    (value: Record<string, string>) => {
      updateConfig({ headers: value || {} })
      setTimeout(() => persistConfig(), 0)
    },
    [updateConfig, persistConfig]
  )

  // 测试连接
  const handleTest = useCallback(() => {
    const cfg = buildConfigToSave()
    const msg = validateConfig(cfg)
    if (msg) {
      setWarningMessage(msg)
      return
    }
    setWarningMessage('')
    onTest(cfg)
  }, [buildConfigToSave, validateConfig, onTest])

  return (
    <div className={styles['mcp-server-item']}>
      <div className={styles['mcp-server-header']} onClick={onToggleExpand}>
        <span className={styles['expand-icon']}>{expanded ? '▼' : '▶'}</span>
        <span className={styles['mcp-server-name']}>{config.name}</span>
        <span
          className={[
            styles['status-indicator'],
            status?.connected ? styles.connected : '',
            status?.error ? styles.error : ''
          ]
            .filter(Boolean)
            .join(' ')}
          title={status?.error || ''}
        >
          {status?.connected ? t('settings.mcp.connected') : t('settings.mcp.disconnected')}
        </span>
        <span className={styles['transport-badge']}>{localConfig.transport}</span>
        <div className={styles['mcp-server-actions']}>
          {!status?.connected ? (
            <button
              className="sm-button sm-button--small"
              disabled={connecting}
              onClick={(e) => {
                e.stopPropagation()
                onConnect()
              }}
            >
              {connecting ? t('common.connecting') : t('common.connect')}
            </button>
          ) : (
            <button
              className="sm-button sm-button--small"
              onClick={(e) => {
                e.stopPropagation()
                onDisconnect()
              }}
            >
              {t('common.disconnect')}
            </button>
          )}
          <button
            className="sm-button sm-button--small"
            disabled={testing}
            onClick={(e) => {
              e.stopPropagation()
              handleTest()
            }}
          >
            {testing ? t('common.testing') : t('common.test')}
          </button>
          <button
            className={[
              'sm-button',
              'sm-button--small',
              'sm-button--danger',
              styles['btn-danger-text']
            ].join(' ')}
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      </div>

      {/* 展开的详情 */}
      {expanded && (
        <div className={styles['mcp-server-details']}>
          <div className={styles['form-group']}>
            <label>{t('settings.mcp.transport')}</label>
            <select
              value={localConfig.transport}
              className="sm-select"
              onChange={(e) => updateTransport(e.target.value)}
            >
              <option value="stdio">{t('settings.mcp.transportStdio')}</option>
              <option value="sse">SSE (Server-Sent Events)</option>
              <option value="streamableHttp">Streamable HTTP</option>
            </select>
          </div>

          {/* stdio 配置 */}
          {localConfig.transport === 'stdio' && (
            <>
              <div className={styles['form-group']}>
                <label>{t('settings.mcp.command')}</label>
                <input
                  type="text"
                  className="sm-input"
                  placeholder="例如: npx, node, python"
                  value={localConfig.command || ''}
                  onChange={(e) => updateConfig({ command: e.target.value })}
                  onBlur={() => persistConfig()}
                />
              </div>
              <div className={styles['form-group']}>
                <label>{t('settings.mcp.commandArgs')}</label>
                <textarea
                  className={['sm-textarea', styles['textarea-small']].join(' ')}
                  placeholder={'-y\n@modelcontextprotocol/server-xxx'}
                  value={argsText}
                  onChange={(e) => setArgsText(e.target.value)}
                  onBlur={handleArgsBlur}
                />
              </div>
              <div className={styles['form-group']}>
                <label>{t('settings.mcp.envVars')}</label>
                <KeyValueEditor
                  value={localConfig.env || {}}
                  placeholder="API_KEY=xxx"
                  onChange={handleEnvChange}
                />
              </div>
            </>
          )}

          {/* HTTP/SSE 配置 */}
          {localConfig.transport !== 'stdio' && (
            <>
              <div className={styles['form-group']}>
                <label>{t('settings.mcp.serviceUrl')}</label>
                <input
                  type="text"
                  className="sm-input"
                  placeholder="https://example.com/mcp"
                  value={localConfig.url || ''}
                  onChange={(e) => updateConfig({ url: e.target.value })}
                  onBlur={() => persistConfig()}
                />
              </div>
              <div className={styles['form-group']}>
                <label>{t('settings.mcp.authHeaders')}</label>
                <KeyValueEditor
                  value={localConfig.headers || {}}
                  placeholder="Authorization=Bearer xxx"
                  onChange={handleHeadersChange}
                />
              </div>
            </>
          )}

          {warningMessage && <div className={styles['inline-warning']}>{warningMessage}</div>}

          {/* 工具列表 */}
          {status?.connected && (
            <div className={styles['tools-section']}>
              <h4 className={styles['tools-title']}>
                {t('settings.mcp.availableTools', { count: status.tools?.length || 0 })}
              </h4>
              <div className={styles['tools-list']}>
                {status.tools?.map((tool) => (
                  <div key={tool.name} className={styles['tool-item']}>
                    <span className={styles['tool-name']}>{tool.name}</span>
                    <span className={styles['tool-desc']}>{tool.description}</span>
                  </div>
                ))}
                {(!status.tools || status.tools.length === 0) && (
                  <div className={styles['empty-tools']}>{t('settings.mcp.noTools')}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
