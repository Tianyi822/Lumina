import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './SshServerMonitorPanel.module.css'

interface SshServerMonitorPanelProps {
  labId: string
  connected: boolean
  active: boolean
}

export default function SshServerMonitorPanel({ connected }: SshServerMonitorPanelProps) {
  return (
    <section className={styles['ssh-server-monitor-panel']}>
      <header className={styles['ssh-server-monitor-panel__header']}>
        <div className={styles['ssh-server-monitor-panel__copy']}>
          <div className={styles['ssh-server-monitor-panel__headline']}>
            <h2>远程资源占用</h2>
          </div>
        </div>
        <div className={styles['ssh-server-monitor-panel__actions']}>
          <button
            className="sm-button sm-button--secondary sm-button--small"
            type="button"
            disabled={!connected}
          >
            <SvgIcon name="refresh" size={14} />
            <span>刷新</span>
          </button>
        </div>
      </header>

      {!connected ? (
        <div className={styles['ssh-server-monitor-panel__state']}>
          <h3>SSH 未连接</h3>
          <p>连接远程服务器后，这里会开始实时显示资源占用。</p>
        </div>
      ) : (
        <div className={styles['ssh-server-monitor-panel__state']}>
          <h3>监控面板</h3>
          <p>SSH 监控数据将在连接后展示。echarts 图表集成待后续增强。</p>
        </div>
      )}
    </section>
  )
}
