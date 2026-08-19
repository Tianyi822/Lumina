import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { MCPServerConfig, MCPTransportType } from '@shared/types/mcp'
import { notifyWarning } from '@renderer/composables/notificationCore'
import KeyValueEditor from './KeyValueEditor'
import styles from './MCPNewServerForm.module.css'

interface MCPNewServerFormProps {
  existingNames: string[]
  onSubmit: (config: MCPServerConfig) => void
  onCancel: () => void
  onTest: (config: MCPServerConfig) => void
}

/** MCP 新建服务器表单：支持传输类型选择 + 动态字段 + 名称验证 */
export default function MCPNewServerForm({
  existingNames,
  onSubmit,
  onCancel,
  onTest
}: MCPNewServerFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<MCPTransportType>('stdio')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [env, setEnv] = useState<Record<string, string>>({})
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState(false)

  // 切换传输类型时重置相关字段
  const handleTransportChange = useCallback((value: MCPTransportType) => {
    setTransport(value)
    if (value === 'stdio') {
      setUrl('')
      setHeaders({})
    } else {
      setCommand('')
      setArgsText('')
      setEnv({})
    }
  }, [])

  // 构建配置对象
  const buildConfig = useCallback((): MCPServerConfig => {
    return {
      name: name.trim(),
      transport,
      command: transport === 'stdio' ? command.trim() : '',
      args:
        transport === 'stdio'
          ? argsText
              .split('\n')
              .map((s) => s.trim())
              .filter((s) => s)
          : [],
      env: transport === 'stdio' ? { ...env } : {},
      url: transport !== 'stdio' ? url.trim() : '',
      headers: transport !== 'stdio' ? { ...headers } : {}
    }
  }, [name, transport, command, argsText, env, url, headers])

  // 校验配置
  const validateConfig = useCallback((): string | null => {
    if (!name.trim()) return t('notifications.settings.mcp.validateNameRequired')
    if (existingNames.some((n) => n === name.trim()))
      return t('notifications.settings.mcp.formNameExists')
    if (transport === 'stdio') {
      if (!command.trim()) return t('notifications.settings.mcp.formCommandRequired')
    } else {
      if (!url.trim()) return t('notifications.settings.mcp.formUrlRequired')
    }
    return null
  }, [name, transport, command, url, existingNames, t])

  // 提交表单
  const handleSubmit = useCallback(() => {
    const error = validateConfig()
    if (error) {
      notifyWarning(t('notifications.settings.mcp.validateFailedTitle'), error, {
        source: 'settings'
      })
      return
    }
    onSubmit(buildConfig())
  }, [validateConfig, buildConfig, onSubmit, t])

  // 测试连接
  const handleTest = useCallback(() => {
    const error = validateConfig()
    if (error) {
      notifyWarning(t('notifications.settings.mcp.validateFailedTitle'), error, {
        source: 'settings'
      })
      return
    }
    setTesting(true)
    onTest(buildConfig())
  }, [validateConfig, buildConfig, onTest, t])

  return (
    <div className={styles['new-model-form']}>
      <h3 className={styles['form-section-title']}>{t('settings.mcp.addServer')}</h3>
      <div className={styles['form-group']}>
        <label>
          {t('settings.mcp.serverName')} <span className={styles.required}>*</span>
        </label>
        <input
          type="text"
          className="sm-input"
          placeholder={t('settings.mcp.serverNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className={styles['form-group']}>
        <label>{t('settings.mcp.transport')}</label>
        <select
          className="sm-select"
          value={transport}
          onChange={(e) => handleTransportChange(e.target.value as MCPTransportType)}
        >
          <option value="stdio">{t('settings.mcp.transportStdio')}</option>
          <option value="sse">SSE (Server-Sent Events)</option>
          <option value="streamableHttp">Streamable HTTP</option>
        </select>
      </div>

      {/* stdio 配置 */}
      {transport === 'stdio' && (
        <>
          <div className={styles['form-group']}>
            <label>
              {t('settings.mcp.command')} <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              className="sm-input"
              placeholder={t('settings.mcp.commandPlaceholder')}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
          </div>
          <div className={styles['form-group']}>
            <label>{t('settings.mcp.commandArgs')}</label>
            <textarea
              className={['sm-textarea', styles['textarea-small']].join(' ')}
              placeholder={'-y\n@modelcontextprotocol/server-xxx'}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
            />
          </div>
          <div className={styles['form-group']}>
            <label>{t('settings.mcp.envVars')}</label>
            <KeyValueEditor
              value={env}
              placeholder="API_KEY=xxx"
              onChange={(val) => setEnv(val || {})}
            />
          </div>
        </>
      )}

      {/* HTTP/SSE 配置 */}
      {transport !== 'stdio' && (
        <>
          <div className={styles['form-group']}>
            <label>
              {t('settings.mcp.serviceUrl')} <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              className="sm-input"
              placeholder="https://example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className={styles['form-group']}>
            <label>{t('settings.mcp.authHeaders')}</label>
            <KeyValueEditor
              value={headers}
              placeholder="Authorization=Bearer your-token"
              onChange={(val) => setHeaders(val || {})}
            />
          </div>
        </>
      )}

      <div className={styles['form-actions']}>
        <button className="sm-button" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="sm-button sm-button--secondary" disabled={testing} onClick={handleTest}>
          {testing ? t('common.testing') : t('common.testConnection')}
        </button>
        <button className="sm-button sm-button--primary" onClick={handleSubmit}>
          {t('common.add')}
        </button>
      </div>
    </div>
  )
}
