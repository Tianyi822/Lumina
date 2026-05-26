import { useState, useCallback } from 'react'
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

/**
 * MCP 新建服务器表单
 *
 * 支持传输类型选择 + 动态字段 + 名称验证。
 * 消费 KeyValueEditor 子组件 + keyValueUtils 工具。
 */
export default function MCPNewServerForm({
  existingNames,
  onSubmit,
  onCancel,
  onTest
}: MCPNewServerFormProps) {
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
    if (!name.trim()) return '请输入服务器名称'
    if (existingNames.some((n) => n === name.trim())) return '该名称已存在'
    if (transport === 'stdio') {
      if (!command.trim()) return '请输入执行命令'
    } else {
      if (!url.trim()) return '请输入服务地址'
    }
    return null
  }, [name, transport, command, url, existingNames])

  // 提交表单
  const handleSubmit = useCallback(() => {
    const error = validateConfig()
    if (error) {
      notifyWarning('配置校验失败', error, { source: 'settings' })
      return
    }
    onSubmit(buildConfig())
  }, [validateConfig, buildConfig, onSubmit])

  // 测试连接
  const handleTest = useCallback(() => {
    const error = validateConfig()
    if (error) {
      notifyWarning('配置校验失败', error, { source: 'settings' })
      return
    }
    setTesting(true)
    onTest(buildConfig())
  }, [validateConfig, buildConfig, onTest])

  return (
    <div className={styles['new-model-form']}>
      <h3 className={styles['form-section-title']}>添加 MCP 服务器</h3>
      <div className={styles['form-group']}>
        <label>
          服务器名称 <span className={styles.required}>*</span>
        </label>
        <input
          type="text"
          className="sm-input"
          placeholder="例如: filesystem, github"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className={styles['form-group']}>
        <label>传输类型</label>
        <select
          className="sm-select"
          value={transport}
          onChange={(e) => handleTransportChange(e.target.value as MCPTransportType)}
        >
          <option value="stdio">stdio (本地进程)</option>
          <option value="sse">SSE (Server-Sent Events)</option>
          <option value="streamableHttp">Streamable HTTP</option>
        </select>
      </div>

      {/* stdio 配置 */}
      {transport === 'stdio' && (
        <>
          <div className={styles['form-group']}>
            <label>
              执行命令 <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              className="sm-input"
              placeholder="例如: npx, node, python"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
          </div>
          <div className={styles['form-group']}>
            <label>命令参数 (每行一个)</label>
            <textarea
              className={['sm-textarea', styles['textarea-small']].join(' ')}
              placeholder={'-y\n@modelcontextprotocol/server-xxx'}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
            />
          </div>
          <div className={styles['form-group']}>
            <label>环境变量 (KEY=VALUE 格式，每行一个)</label>
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
              服务地址 <span className={styles.required}>*</span>
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
            <label>认证头 (KEY=VALUE 格式，每行一个)</label>
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
          取消
        </button>
        <button className="sm-button sm-button--secondary" disabled={testing} onClick={handleTest}>
          {testing ? '测试中...' : '测试连接'}
        </button>
        <button className="sm-button sm-button--primary" onClick={handleSubmit}>
          添加
        </button>
      </div>
    </div>
  )
}
