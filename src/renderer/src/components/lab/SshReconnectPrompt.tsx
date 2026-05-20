import styles from './SshReconnectPrompt.module.css'
import type { LabData } from '@renderer/types/lab'

interface SshReconnectPromptProps {
  password: string
  lab: LabData
  connecting: boolean
  onUpdatePassword: (password: string) => void
  onConnect: () => void
}

export default function SshReconnectPrompt({
  password,
  lab,
  connecting,
  onUpdatePassword,
  onConnect
}: SshReconnectPromptProps) {
  const needPassword = lab.ssh?.authType === 'password'

  return (
    <div className={styles['ssh-reconnect-prompt']}>
      <div className={styles['reconnect-info']}>
        <span className={styles['reconnect-label']}>SSH 已断开</span>
        <span className={styles['reconnect-host']}>
          {lab.ssh?.host}:{lab.ssh?.port}
        </span>
      </div>
      {needPassword && (
        <input
          value={password}
          type="password"
          className="sm-input"
          placeholder="SSH 密码"
          onChange={(e) => onUpdatePassword(e.target.value)}
        />
      )}
      <button
        className="sm-button sm-button--primary sm-button--small"
        disabled={connecting || (needPassword && !password.trim())}
        onClick={onConnect}
      >
        {connecting ? '连接中...' : '重新连接'}
      </button>
    </div>
  )
}
