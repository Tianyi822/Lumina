import styles from './SshReconnectPrompt.module.css'
import type { LabData } from '@renderer/types/lab'

/** SSH 断线后重新连接提示条：密码输入 + 重连按钮 */
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
      {needPassword && (
        <input
          value={password}
          type="password"
          className={styles['ssh-reconnect-prompt__password']}
          placeholder="SSH 密码"
          onChange={(e) => onUpdatePassword(e.target.value)}
        />
      )}
      <button
        type="button"
        className={`sm-button sm-button--primary ${styles['ssh-reconnect-prompt__button']}`}
        disabled={connecting || (needPassword && !password.trim())}
        onClick={onConnect}
      >
        {connecting ? '连接中...' : '重新连接'}
      </button>
    </div>
  )
}
