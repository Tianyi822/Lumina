import styles from './MCPConnectionTest.module.css'

interface MCPConnectionTestProps {
  testing: boolean
  result?: 'success' | 'error' | null
  message?: string
}

/**
 * MCP 连接测试结果展示
 *
 * 纯展示组件，显示测试中/成功/失败三种状态。
 */
export default function MCPConnectionTest({ testing, result, message }: MCPConnectionTestProps) {
  if (testing) {
    return (
      <div className={[styles['connection-test'], styles.testing].join(' ')}>
        <span className={styles['test-icon']}>⏳</span>
        <span>测试中...</span>
      </div>
    )
  }

  if (result === 'success' && message) {
    return (
      <div className={[styles['connection-test'], styles.success].join(' ')}>
        <span className={styles['test-icon']}>✓</span>
        <span>{message}</span>
      </div>
    )
  }

  if (result === 'error' && message) {
    return (
      <div className={[styles['connection-test'], styles.error].join(' ')}>
        <span className={styles['test-icon']}>✗</span>
        <span>{message}</span>
      </div>
    )
  }

  return null
}
