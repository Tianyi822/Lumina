import { useCallback, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppLanguage } from '@shared/types/config'
import { changeAppLanguage } from '@renderer/i18n'
import styles from './LanguageSettings.module.css'

/** 语言选项：label 以各自语言自称（国际化通行做法，不随界面语言变化） */
const LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' }
]

/** 语言选择 section：分段选择器，点击即切换并持久化；radiogroup 支持方向键漫游 */
export default function LanguageSettings() {
  const { t, i18n } = useTranslation()
  const current: AppLanguage = i18n.language === 'en' ? 'en' : 'zh'
  const optionRefs = useRef(new Map<AppLanguage, HTMLButtonElement>())

  const focusOption = useCallback((value: AppLanguage) => {
    optionRefs.current.get(value)?.focus()
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const index = LANGUAGE_OPTIONS.findIndex((option) => option.value === current)
      let next = -1
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          next = (index + 1) % LANGUAGE_OPTIONS.length
          break
        case 'ArrowUp':
        case 'ArrowLeft':
          next = (index - 1 + LANGUAGE_OPTIONS.length) % LANGUAGE_OPTIONS.length
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = LANGUAGE_OPTIONS.length - 1
          break
        default:
          return
      }
      event.preventDefault()
      const nextValue = LANGUAGE_OPTIONS[next].value
      if (nextValue !== current) void changeAppLanguage(nextValue)
      focusOption(nextValue)
    },
    [current, focusOption]
  )

  return (
    <section className="sm-settings-page__section">
      <div className="sm-settings-page__section-header">
        <div>
          <h3 className="sm-settings-page__section-title">
            {t('settings.display.language.title')}
          </h3>
          <p className="sm-settings-page__section-description">
            {t('settings.display.language.description')}
          </p>
        </div>
      </div>

      <div
        className={styles['language-options']}
        role="radiogroup"
        aria-label={t('settings.display.language.title')}
        onKeyDown={handleKeyDown}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            ref={(node) => {
              if (node) optionRefs.current.set(option.value, node)
              else optionRefs.current.delete(option.value)
            }}
            type="button"
            role="radio"
            aria-checked={current === option.value}
            tabIndex={current === option.value ? 0 : -1}
            className={[
              styles['language-option'],
              current === option.value && styles['is-selected']
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => void changeAppLanguage(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}
