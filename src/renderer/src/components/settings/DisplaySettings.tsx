import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStateStore, AVAILABLE_THEMES } from '@renderer/stores/uiStateStore'
import type { ThemeConfig, ThemeMode } from '@shared/types/config'
import LanguageSettings from './LanguageSettings'
import styles from './DisplaySettings.module.css'

/** 主题卡片描述文案的翻译 key（按主题 id 映射；未知主题不显示描述） */
const THEME_DESC_KEYS: Record<string, string> = {
  'lumina-dark': 'settings.display.theme.descDark',
  'lumina-light': 'settings.display.theme.descLight'
}

/** 显示设置页面：语言选择、手动主题选择、跟随系统主题切换 */
interface DisplaySettingsProps {
  value: ThemeConfig
  onThemeChange: (themeId: string) => void
}

export default function DisplaySettings({ onThemeChange }: DisplaySettingsProps) {
  const { t } = useTranslation()
  const currentTheme = useUIStateStore((s) => s.currentTheme)
  const selectedTheme = useUIStateStore((s) => s.selectedTheme)
  const themeMode = useUIStateStore((s) => s.themeMode)
  const systemTheme = useUIStateStore((s) => s.systemTheme)
  const setTheme = useUIStateStore((s) => s.setTheme)
  const setThemeMode = useUIStateStore((s) => s.setThemeMode)

  const isAutoMode = themeMode === 'system'
  const systemThemeLabel =
    systemTheme === 'dark'
      ? t('settings.display.theme.systemDark')
      : t('settings.display.theme.systemLight')

  const handleSelectTheme = useCallback(
    (themeId: string) => {
      if (isAutoMode) return
      setTheme(themeId)
      onThemeChange(themeId)
    },
    [isAutoMode, setTheme, onThemeChange]
  )

  const handleToggleAutoTheme = useCallback(() => {
    const newMode: ThemeMode = isAutoMode ? 'manual' : 'system'
    setThemeMode(newMode)
  }, [isAutoMode, setThemeMode])

  function isSelected(themeId: string): boolean {
    if (isAutoMode) return false
    return selectedTheme === themeId
  }

  return (
    <div className={['sm-settings-page', styles['display-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">{t('settings.display.title')}</h2>
        <p className="sm-settings-page__description">{t('settings.display.description')}</p>
      </header>

      <LanguageSettings />

      <button
        type="button"
        className={styles['auto-theme-toggle']}
        aria-pressed={isAutoMode}
        onClick={handleToggleAutoTheme}
      >
        <span className={styles['auto-theme-toggle__copy']}>
          <span className={styles['auto-theme-toggle__title']}>
            {t('settings.display.theme.followSystem')}
          </span>
          <span className={styles['auto-theme-toggle__desc']}>
            {isAutoMode
              ? t('settings.display.theme.followSystemAuto', { mode: systemThemeLabel })
              : t('settings.display.theme.followSystemManual', { mode: systemThemeLabel })}
          </span>
        </span>

        <span className={styles['auto-theme-toggle__control']} aria-hidden="true">
          <span className={styles['auto-theme-toggle__track']}>
            <span className={styles['auto-theme-toggle__thumb']}></span>
          </span>
        </span>
      </button>

      <section className="sm-settings-page__section">
        <div className="sm-settings-page__section-header">
          <div>
            <h3 className="sm-settings-page__section-title">
              {t('settings.display.theme.available')}
            </h3>
            <p className="sm-settings-page__section-description">
              {isAutoMode
                ? t('settings.display.theme.availableDescAuto')
                : t('settings.display.theme.availableDescManual')}
            </p>
          </div>

          <span className="sm-settings-chip sm-settings-chip--accent">
            {t('settings.display.theme.currentChip', {
              name:
                AVAILABLE_THEMES.find((theme) => theme.id === currentTheme)?.name || currentTheme
            })}
          </span>
        </div>

        <div className={styles['theme-grid']}>
          {AVAILABLE_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={[
                styles['theme-card'],
                isSelected(theme.id) && styles['is-selected'],
                isAutoMode && styles['is-disabled']
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={t('settings.display.theme.applyTheme', { name: theme.name })}
              aria-pressed={!isAutoMode && isSelected(theme.id)}
              disabled={isAutoMode}
              onClick={() => handleSelectTheme(theme.id)}
            >
              <div className={styles['theme-preview']}>
                {theme.previewColors && (
                  <>
                    <div
                      className={[styles['preview-color'], styles.primary].join(' ')}
                      style={{ backgroundColor: theme.previewColors.primary }}
                    />
                    <div
                      className={[styles['preview-color'], styles.secondary].join(' ')}
                      style={{ backgroundColor: theme.previewColors.secondary }}
                    />
                    <div
                      className={[styles['preview-color'], styles.accent].join(' ')}
                      style={{ backgroundColor: theme.previewColors.accent }}
                    />
                    {theme.previewColors.extra1 && (
                      <div
                        className={[styles['preview-color'], styles.extra].join(' ')}
                        style={{ backgroundColor: theme.previewColors.extra1 }}
                      />
                    )}
                    {theme.previewColors.extra2 && (
                      <div
                        className={[styles['preview-color'], styles.extra].join(' ')}
                        style={{ backgroundColor: theme.previewColors.extra2 }}
                      />
                    )}
                  </>
                )}
              </div>

              <div className={styles['theme-info']}>
                <span className={styles['theme-name']}>{theme.name}</span>
                <span className={styles['theme-desc']}>
                  {THEME_DESC_KEYS[theme.id] ? t(THEME_DESC_KEYS[theme.id]) : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
