import { useState, useCallback } from 'react'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import { useKnowledgeMCP } from './hooks/useKnowledgeMCP'
import styles from './KnowledgeMCPSettings.module.css'

export default function KnowledgeMCPSettings() {
  const {
    status,
    config: configJSON,
    loading,
    error,
    start,
    stop,
    refreshStatus
  } = useKnowledgeMCP()
  const [toggling, setToggling] = useState(false)
  const [copying, setCopying] = useState(false)

  const enabled = status.running

  // 切换服务状态
  const handleToggle = useCallback(async () => {
    if (toggling || loading) return

    setToggling(true)
    try {
      if (enabled) {
        const result = await stop()
        if (result.success) {
          notifySuccess('知识库 MCP', 'MCP 服务已停止', { source: 'settings' })
        } else {
          notifyError('知识库 MCP', '停止服务失败', { source: 'settings' })
        }
      } else {
        const result = await start()
        if (result.success) {
          notifySuccess('知识库 MCP', 'MCP 服务已启动', { source: 'settings' })
        } else {
          notifyError('知识库 MCP', `启动服务失败: ${result.error || '未知错误'}`, {
            source: 'settings'
          })
        }
      }
      await refreshStatus()
    } catch (error) {
      notifyError(
        '知识库 MCP',
        `操作失败: ${error instanceof Error ? error.message : String(error)}`,
        {
          source: 'settings'
        }
      )
    } finally {
      setToggling(false)
    }
  }, [enabled, toggling, loading, start, stop, refreshStatus])

  // 复制配置
  const handleCopy = useCallback(async () => {
    if (!configJSON) return

    setCopying(true)
    try {
      await navigator.clipboard.writeText(configJSON)
      notifySuccess('知识库 MCP', '配置已复制到剪贴板', { source: 'settings' })
    } catch (error) {
      notifyError(
        '知识库 MCP',
        `复制失败: ${error instanceof Error ? error.message : String(error)}`,
        {
          source: 'settings'
        }
      )
    } finally {
      setCopying(false)
    }
  }, [configJSON])

  return (
    <div className={['sm-settings-page', styles['knowledge-mcp-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">知识库 MCP 服务</h2>
        <p className="sm-settings-page__description">
          将知识库检索能力暴露给外部 MCP 客户端，适用于桌面端、IDE 和其他 AI 工具链。
        </p>
      </header>

      <section className="sm-settings-page__section">
        <div className="sm-settings-page__section-header">
          <div>
            <h3 className="sm-settings-page__section-title">服务状态</h3>
            <p className="sm-settings-page__section-description">
              启停服务后，配置 JSON 会自动更新，可直接复制到支持 MCP 的客户端中。
            </p>
          </div>
        </div>

        <button
          className={[
            styles['mcp-toggle'],
            enabled && styles.enabled,
            (toggling || loading) && styles.disabled
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={toggling || loading}
          type="button"
          onClick={handleToggle}
        >
          <div className={styles['toggle-switch']}>
            <div className={styles['toggle-thumb']}></div>
          </div>
          <span className={styles['toggle-label']}>启用 MCP 服务</span>
          {enabled ? (
            <span className={[styles['status-badge'], styles.active].join(' ')}>运行中</span>
          ) : (
            <span className={styles['status-badge']}>已停止</span>
          )}
        </button>
        {error && !loading && <p className={styles['mcp-error']}>{error}</p>}
      </section>

      {enabled && configJSON && (
        <section className="sm-settings-page__section">
          <div className={styles['config-header']}>
            <div>
              <h3 className="sm-settings-page__section-title">服务配置</h3>
              <p className="sm-settings-page__section-description">
                复制后可直接写入 MCP 客户端配置文件。
              </p>
            </div>
            <button
              className={['sm-button', 'sm-button--small', styles['copy-btn']].join(' ')}
              disabled={copying}
              onClick={handleCopy}
            >
              {copying ? '复制中...' : '复制'}
            </button>
          </div>
          <div className={styles['config-url']}>
            <span className={styles['url-label']}>服务地址</span>
            <span className={styles['url-value']}>{status.url}</span>
          </div>
          <pre className={styles['config-json']}>
            <code>{configJSON}</code>
          </pre>
        </section>
      )}

      <section className="sm-settings-page__section">
        <div className="sm-settings-page__section-header">
          <div>
            <h3 className="sm-settings-page__section-title">使用说明</h3>
            <p className="sm-settings-page__section-description">
              统一说明服务用途、接入步骤和安全边界，避免页面与弹窗之间出现不同语气。
            </p>
          </div>
        </div>

        <div className={styles['description-section']}>
          <div className={styles['description-block']}>
            <h5>知识库 MCP 服务</h5>
            <p>
              知识库 MCP 服务将您在本应用中创建的知识库通过 MCP 协议对外暴露，让外部 AI
              工具能够搜索和引用您的知识库内容。启用后，其他支持 MCP
              协议的工具可以直接调用知识库搜索功能，获取相关文档片段作为上下文。
            </p>
          </div>

          <div className={styles['description-block']}>
            <h5>使用场景</h5>
            <ul>
              <li>在 Claude Desktop 中直接搜索和引用您的知识库内容</li>
              <li>在 Cursor、Windsurf 等 IDE 中获取知识库上下文</li>
              <li>让其他支持 MCP 协议的 AI 工具访问您的私有知识</li>
            </ul>
          </div>

          <div className={styles['description-block']}>
            <h5>如何使用</h5>
            <ol>
              <li>开启上方开关启动 MCP 服务</li>
              <li>复制上方显示的 JSON 配置</li>
              <li>将配置添加到您的 MCP 客户端配置文件中</li>
              <li>重启 MCP 客户端即可使用知识库工具</li>
            </ol>
          </div>

          <div className={[styles['description-block'], styles.warning].join(' ')}>
            <h5>安全注意事项</h5>
            <ul>
              <li>服务仅监听本地网络接口，外部设备需要通过局域网访问</li>
              <li>请确保您的防火墙设置允许指定端口的访问</li>
              <li>当前版本不包含认证机制，请在可信网络环境中使用</li>
              <li>关闭应用时服务会自动停止</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
