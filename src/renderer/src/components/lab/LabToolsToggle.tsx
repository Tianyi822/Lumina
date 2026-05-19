import { useState, useEffect } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './LabToolsToggle.module.css'

interface LabToolsToggleProps {
  modelValue: boolean
  disabled?: boolean
  compact?: boolean
  onUpdateModelValue: (value: boolean) => void
  onChange?: (value: boolean) => void
}

export default function LabToolsToggle({
  modelValue,
  disabled,
  compact,
  onUpdateModelValue,
  onChange
}: LabToolsToggleProps) {
  const [isEnabled, setIsEnabled] = useState(modelValue)

  useEffect(() => {
    setIsEnabled(modelValue)
  }, [modelValue])

  useEffect(() => {
    window.api.logger.debug('[LabToolsToggle] 组件挂载', { enabled: isEnabled })
  }, [])

  function toggle(): void {
    if (!disabled) {
      const next = !isEnabled
      setIsEnabled(next)
      onUpdateModelValue(next)
      onChange?.(next)
    }
  }

  return (
    <div
      className={`${styles['lab-tools-toggle']} ${isEnabled ? styles.enabled : ''} ${disabled ? styles.disabled : ''} ${compact ? styles['is-compact'] : ''}`}
    >
      <button type="button" onClick={toggle} disabled={disabled}>
        <SvgIcon name="tools" size={14} />
        <span>{isEnabled ? '工具已开启' : '工具已关闭'}</span>
      </button>
    </div>
  )
}
