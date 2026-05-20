import { useState, useEffect } from 'react'
import { useDockerConfigStore } from '@renderer/stores'
import styles from './DockerConfigManager.module.css'

interface DockerConfigManagerProps {
  visible: boolean
  onClose: () => void
}

export default function DockerConfigManager({ visible, onClose }: DockerConfigManagerProps) {
  const dockerConfigs = useDockerConfigStore((s) => s.dockerfileConfigs)
  const loadDockerfileConfigs = useDockerConfigStore((s) => s.loadDockerfileConfigs)
  const deleteDockerfileConfig = useDockerConfigStore((s) => s.deleteDockerfileConfig)
  const [activeTab, setActiveTab] = useState<'dockerfile' | 'compose'>('dockerfile')

  useEffect(() => {
    if (visible) loadDockerfileConfigs()
  }, [visible, loadDockerfileConfigs])

  if (!visible) return null

  return (
    <div className={`sm-modal__overlay ${styles['config-manager-overlay']}`} onClick={onClose}>
      <div
        className={`sm-modal__surface ${styles['config-manager']}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm-pane-header">
          <h2>配置管理</h2>
          <button className="sm-icon-button close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={styles['config-tabs']}>
          <button
            className={`${styles['config-tab']} ${activeTab === 'dockerfile' ? styles.active : ''}`}
            onClick={() => setActiveTab('dockerfile')}
          >
            Dockerfile ({dockerConfigs.length})
          </button>
        </div>
        <div className={styles['config-list']}>
          {dockerConfigs.map((c) => (
            <div key={c.id} className={styles['config-item']}>
              <span>{c.name}</span>
              <button
                className="sm-button sm-button--danger sm-button--small"
                onClick={() => deleteDockerfileConfig(c.id)}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
