import styles from './MCPSettings.module.css'

export default function MCPSettings() {
  return (
    <div className="sm-settings-page">
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">MCP 服务</h2>
        <p className="sm-settings-page__description">连接外部工具链并管理服务传输方式。</p>
      </header>
      <div className={styles['mcp-settings']}>
        <p>MCP 服务配置 — 待完善</p>
      </div>
    </div>
  )
}
