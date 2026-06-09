import { useCallback } from 'react'
import { useUIStateStore, AVAILABLE_THEMES } from '@renderer/stores/uiStateStore'
import type { ThemeConfig, ThemeMode } from '@shared/types/config'
import styles from './ThemeSettings.module.css'

/** 主题设置页面：手动主题选择、跟随系统主题切换 */
interface ThemeSettingsProps {
  value: ThemeConfig
  onThemeChange: (themeId: string) => void
}

export default function ThemeSettings({ onThemeChange }: ThemeSettingsProps) {
  const currentTheme = useUIStateStore((s) => s.currentTheme)
  const selectedTheme = useUIStateStore((s) => s.selectedTheme)
  const themeMode = useUIStateStore((s) => s.themeMode)
  const systemTheme = useUIStateStore((s) => s.systemTheme)
  const setTheme = useUIStateStore((s) => s.setTheme)
  const setThemeMode = useUIStateStore((s) => s.setThemeMode)

  const isAutoMode = themeMode === 'system'
  const systemThemeLabel = systemTheme === 'dark' ? '深色' : '浅色'

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
    <div className={['sm-settings-page', styles['theme-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">主题设置</h2>
        <p className="sm-settings-page__description">
          选择适合你的界面风格，主题切换即时生效并会同步系统原生 UI。
        </p>
      </header>

      <button
        type="button"
        className={styles['auto-theme-toggle']}
        aria-pressed={isAutoMode}
        onClick={handleToggleAutoTheme}
      >
        <span className={styles['auto-theme-toggle__copy']}>
          <span className={styles['auto-theme-toggle__title']}>跟随系统主题</span>
          <span className={styles['auto-theme-toggle__desc']}>
            当前检测到系统为{systemThemeLabel}模式，
            {isAutoMode ? '应用会自动同步' : '你可以手动切换主题'}。
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
            <h3 className="sm-settings-page__section-title">可用主题</h3>
            <p className="sm-settings-page__section-description">
              {isAutoMode
                ? '已启用跟随系统，主题卡片仅作当前映射预览。关闭自动切换后可手动选择。'
                : '选择一个主题作为全局外观，所有界面元素将自动适配。'}
            </p>
          </div>

          <span className="sm-settings-chip sm-settings-chip--accent">
            当前主题:
            {AVAILABLE_THEMES.find((t) => t.id === currentTheme)?.name || currentTheme}
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
              aria-label={`应用主题 ${theme.name}`}
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
                {theme.description && (
                  <span className={styles['theme-desc']}>{theme.description}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
