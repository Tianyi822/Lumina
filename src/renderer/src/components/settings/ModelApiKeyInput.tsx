import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './ModelApiKeyInput.module.css'

/** API Key 输入组件：密码遮罩 + 显示/隐藏切换按钮 */
interface ModelApiKeyInputProps {
  value: string
  placeholder?: string
  autoComplete?: string
  onChange: (value: string) => void
}

export default function ModelApiKeyInput({
  value,
  placeholder = 'sk-...',
  autoComplete = 'new-password',
  onChange
}: ModelApiKeyInputProps) {
  const [visible, setVisible] = useState(false)
  const { t } = useTranslation()

  const toggleVisible = useCallback(() => {
    setVisible((prev) => !prev)
  }, [])

  return (
    <div className={styles['api-key-input']}>
      <input
        type={visible ? 'text' : 'password'}
        className="sm-input"
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className={styles['api-key-input__toggle']}
        aria-label={visible ? t('settings.model.apiKeyHide') : t('settings.model.apiKeyShow')}
        aria-pressed={visible}
        onClick={toggleVisible}
      >
        <SvgIcon name={visible ? 'eye-hidden' : 'eye-visible'} size={16} />
      </button>
    </div>
  )
}
