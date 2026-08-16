import { useTranslation } from 'react-i18next'
import type { AppLanguage } from '@shared/types/config'
import { changeAppLanguage } from '@renderer/i18n'
import styles from './LanguageSettings.module.css'

/** 语言选项：label 以各自语言自称（国际化通行做法，不随界面语言变化） */
const LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' }
]

/** 语言选择 section：分段选择器，点击即切换并持久化 */
export default function LanguageSettings() {
  const { t, i18n } = useTranslation()
  const current: AppLanguage = i18n.language === 'en' ? 'en' : 'zh'

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
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={current === option.value}
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
