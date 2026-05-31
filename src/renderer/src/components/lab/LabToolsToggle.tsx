import { useState, useEffect, memo } from 'react'
import styles from './LabToolsToggle.module.css'

interface LabToolsToggleProps {
  modelValue: boolean
  disabled?: boolean
  compact?: boolean
  className?: string
  onUpdateModelValue: (value: boolean) => void
  onChange?: (value: boolean) => void
}

function LabToolsToggle({
  modelValue,
  disabled,
  compact,
  className,
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
      className={[
        styles['lab-tools-toggle'],
        isEnabled ? styles.enabled : '',
        disabled ? styles.disabled : '',
        compact ? styles['is-compact'] : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={isEnabled}
      aria-disabled={disabled}
      onClick={toggle}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggle()
        }
      }}
    >
      <span className={styles['toggle-switch']} aria-hidden="true">
        <span className={styles['toggle-thumb']}></span>
      </span>
      <span className={styles['toggle-label']}>实验室</span>
    </div>
  )
}

export default memo(LabToolsToggle)
