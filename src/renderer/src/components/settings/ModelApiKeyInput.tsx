import { useState, useCallback } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './ModelApiKeyInput.module.css'

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
        aria-label={visible ? '隐藏 API Key' : '显示 API Key'}
        aria-pressed={visible}
        onClick={toggleVisible}
      >
        <SvgIcon name={visible ? 'eye-hidden' : 'eye-visible'} size={16} />
      </button>
    </div>
  )
}
