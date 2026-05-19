import { useState } from 'react'
import styles from './SaveConfigDialog.module.css'

interface SaveConfigDialogProps {
  visible: boolean
  onClose: () => void
  onSave: (name: string) => void
}

export default function SaveConfigDialog({ visible, onClose, onSave }: SaveConfigDialogProps) {
  const [configName, setConfigName] = useState('')
  const [isComposing, setIsComposing] = useState(false)

  function handleKeydown(event: React.KeyboardEvent): void {
    if (isComposing || event.key !== 'Enter') return
    event.preventDefault()
    handleSave()
  }

  function handleSave(): void {
    if (!configName.trim()) return
    onSave(configName.trim())
    setConfigName('')
  }

  function handleClose(): void {
    setConfigName('')
    onClose()
  }

  if (!visible) return null

  return (
    <div className={styles['save-dialog-overlay']} onClick={handleClose}>
      <div className={styles['save-dialog']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['save-dialog-header']}>
          <h4>保存配置</h4>
          <button className={`${styles['close-btn']} ${styles.small}`} onClick={handleClose}>
            ×
          </button>
        </div>
        <div className={styles['save-dialog-body']}>
          <input
            value={configName}
            type="text"
            className="sm-input"
            placeholder="输入配置名称..."
            onChange={(e) => setConfigName(e.target.value)}
            onKeyDown={handleKeydown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
          />
          <button className="sm-button sm-button--primary" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
