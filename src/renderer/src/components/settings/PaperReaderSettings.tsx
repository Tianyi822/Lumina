import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@renderer/stores/configStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import { deepClone } from '@shared/utils/data-processors'
import {
  OCR_PROVIDER_PRESETS,
  DEFAULT_OCR_PROVIDER,
  getOcrProviderPreset,
  type OcrProviderId,
  type PaperReaderConfig
} from '@shared/types/config'
import styles from './PaperReaderSettings.module.css'

/** 论文阅读设置页：OCR 服务商配置、API Key 管理和翻译模型选择 */
export default function PaperReaderSettings() {
  const { t } = useTranslation()
  const [localConfig, setLocalConfig] = useState<PaperReaderConfig>({
    ocr: { provider: DEFAULT_OCR_PROVIDER }
  })
  const [testing, setTesting] = useState(false)

  // Zustand selectors
  const paperReaderConfig = useConfigStore((s) => s.paperReaderConfig)
  const defaultModel = useConfigStore((s) => s.defaultModel)
  const llmConfigs = useConfigStore((s) => s.llmConfigs)
  const updatePaperReaderConfig = useConfigStore((s) => s.updatePaperReaderConfig)
  const saveConfig = useConfigStore((s) => s.saveConfig)
  const notifyConfigUpdate = useUIStateStore((s) => s.notifyConfigUpdate)

  // 初始化 localConfig
  useEffect(() => {
    setLocalConfig(deepClone(paperReaderConfig))
  }, [paperReaderConfig])

  // 计算属性
  const currentPreset = useMemo(
    () => getOcrProviderPreset(localConfig.ocr.provider),
    [localConfig.ocr.provider]
  )

  const ocrHasChanges = useMemo(() => {
    const current = localConfig
    const saved = paperReaderConfig
    return (
      current.ocr.provider !== saved.ocr.provider ||
      (current.ocr.apiKey ?? '') !== (saved.ocr.apiKey ?? '')
    )
  }, [localConfig, paperReaderConfig])

  const translationHasChanges = useMemo(() => {
    const current = localConfig
    const saved = paperReaderConfig
    return (current.translationModel ?? '') !== (saved.translationModel ?? '')
  }, [localConfig, paperReaderConfig])

  const canTest = useMemo(
    () => !!localConfig.ocr.apiKey?.trim() && !testing,
    [localConfig.ocr.apiKey, testing]
  )

  const translationModelOptions = useMemo(() => {
    const defaultLabel = defaultModel
      ? t('settings.paperReader.useDefaultNamed', { model: defaultModel })
      : t('settings.paperReader.useDefault')
    const options = [{ label: defaultLabel, value: '' }]
    for (const model of llmConfigs) {
      options.push({
        label:
          model.model_name +
          (model.model_name === defaultModel ? t('settings.paperReader.defaultSuffix') : ''),
        value: model.model_name
      })
    }
    return options
  }, [defaultModel, llmConfigs, t])

  // 构建纯配置对象
  const buildPlainConfig = useCallback((): PaperReaderConfig => {
    const config: PaperReaderConfig = {
      ocr: {
        provider: localConfig.ocr.provider || DEFAULT_OCR_PROVIDER,
        apiKey: localConfig.ocr.apiKey?.trim() || undefined
      }
    }
    const model = localConfig.translationModel?.trim()
    if (model) {
      config.translationModel = model
    }
    return config
  }, [localConfig])

  // 处理 OCR 提供商切换
  const handleProviderChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerId = e.target.value as OcrProviderId
    setLocalConfig((prev) => ({
      ...prev,
      ocr: { ...prev.ocr, provider: providerId }
    }))
  }, [])

  // 测试连接
  const handleTestConnection = useCallback(async () => {
    if (!localConfig.ocr.apiKey?.trim()) {
      notifyError(
        t('notifications.settings.paperReader.title'),
        t('notifications.settings.paperReader.apiKeyRequired'),
        { source: 'settings' }
      )
      return
    }

    setTesting(true)
    try {
      const result = await window.api.paper.testOcrConnection({
        provider: localConfig.ocr.provider,
        apiKey: localConfig.ocr.apiKey ?? ''
      })

      if (result.success) {
        notifySuccess(
          t('notifications.settings.paperReader.title'),
          t('notifications.settings.paperReader.testSuccess'),
          { source: 'settings' }
        )
      } else {
        notifyError(
          t('notifications.settings.paperReader.title'),
          result.error ?? t('notifications.settings.paperReader.testFailedFallback'),
          { source: 'settings' }
        )
      }
    } catch (error) {
      notifyError(
        t('notifications.settings.paperReader.title'),
        `${t('notifications.settings.paperReader.testFailedPrefix')}${
          error instanceof Error ? error.message : String(error)
        }`,
        { source: 'settings' }
      )
    } finally {
      setTesting(false)
    }
  }, [localConfig.ocr, t])

  // 保存 OCR 配置
  const handleSaveOcr = useCallback(async () => {
    const plainConfig = buildPlainConfig()
    updatePaperReaderConfig(plainConfig)
    const success = await saveConfig({ silent: true })
    if (!success) {
      notifyError(
        t('notifications.settings.paperReader.title'),
        t('notifications.settings.paperReader.saveFailed'),
        { source: 'settings' }
      )
      return
    }
    notifyConfigUpdate()
    notifySuccess(
      t('notifications.settings.paperReader.title'),
      t('notifications.settings.paperReader.ocrSaved'),
      { source: 'settings' }
    )
  }, [buildPlainConfig, updatePaperReaderConfig, saveConfig, notifyConfigUpdate, t])

  // 保存翻译模型配置
  const handleSaveTranslation = useCallback(async () => {
    const plainConfig = buildPlainConfig()
    updatePaperReaderConfig(plainConfig)
    const success = await saveConfig({ silent: true })
    if (!success) {
      notifyError(
        t('notifications.settings.paperReader.title'),
        t('notifications.settings.paperReader.saveFailed'),
        { source: 'settings' }
      )
      return
    }
    notifyConfigUpdate()
    notifySuccess(
      t('notifications.settings.paperReader.title'),
      t('notifications.settings.paperReader.translationSaved'),
      { source: 'settings' }
    )
  }, [buildPlainConfig, updatePaperReaderConfig, saveConfig, notifyConfigUpdate, t])

  // 打开 API Key 获取页面
  const handleOpenApiKeyUrl = useCallback(() => {
    const url = currentPreset?.apiKeyUrl
    if (url) {
      window.api.window.openExternal(url)
    }
  }, [currentPreset])

  return (
    <div className={['sm-settings-page', styles['paper-reader-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">{t('settings.paperReader.ocrTitle')}</h2>
        <p className="sm-settings-page__description">{t('settings.paperReader.ocrDescription')}</p>
      </header>

      <section className="sm-settings-page__section">
        <div className={[styles['form-group'], styles['field-card']].join(' ')}>
          <label className={styles['form-label']} htmlFor="paper-ocr-provider">
            {t('settings.paperReader.ocrProvider')}
          </label>
          <select
            id="paper-ocr-provider"
            className="sm-input"
            value={localConfig.ocr.provider}
            onChange={handleProviderChange}
          >
            {OCR_PROVIDER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles['form-row']}>
          <div className={[styles['form-group'], styles['field-card'], styles['flex-1']].join(' ')}>
            <label className={styles['form-label']}>{t('settings.paperReader.modelName')}</label>
            <div className={styles['provider-display']}>{currentPreset?.modelName ?? '-'}</div>
          </div>

          <div className={[styles['form-group'], styles['field-card'], styles['flex-1']].join(' ')}>
            <label className={styles['form-label']}>
              {t('settings.paperReader.concurrency')}
              <span className={styles['field-hint']}>
                {t('settings.paperReader.concurrencyHint')}
              </span>
            </label>
            <div className={styles['provider-display']}>{currentPreset?.concurrency ?? '-'}</div>
          </div>
        </div>

        <div className={styles['form-row']}>
          <div className={[styles['form-group'], styles['field-card'], styles['flex-1']].join(' ')}>
            <label className={styles['form-label']}>
              API Key
              {currentPreset?.apiKeyUrl && (
                <a
                  className={styles['api-key-link']}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    handleOpenApiKeyUrl()
                  }}
                >
                  {t('settings.paperReader.getApiKey')}
                </a>
              )}
            </label>
            <input
              type="password"
              className="sm-input"
              placeholder={t('settings.paperReader.apiKeyPlaceholder')}
              autoComplete="new-password"
              value={localConfig.ocr.apiKey ?? ''}
              onChange={(e) =>
                setLocalConfig((prev) => ({
                  ...prev,
                  ocr: { ...prev.ocr, apiKey: e.target.value }
                }))
              }
            />
          </div>
        </div>

        <div className={[styles['form-group'], styles['field-card']].join(' ')}>
          <label className={styles['form-label']}>{t('settings.paperReader.requestUrl')}</label>
          <div className={styles['provider-display']}>{currentPreset?.url ?? '-'}</div>
        </div>

        <div className={styles['form-actions']}>
          <div className={styles['form-actions__buttons']}>
            <button
              className="sm-button sm-button--secondary"
              disabled={!canTest}
              onClick={handleTestConnection}
            >
              {testing ? t('common.testing') : t('common.testConnection')}
            </button>
            <button
              className="sm-button sm-button--primary"
              disabled={!ocrHasChanges}
              onClick={handleSaveOcr}
            >
              {t('common.saveConfig')}
            </button>
          </div>
        </div>
      </section>

      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">{t('settings.paperReader.translationTitle')}</h2>
        <p className="sm-settings-page__description">
          {t('settings.paperReader.translationDescription')}
        </p>
      </header>

      <section className="sm-settings-page__section">
        <div className={[styles['form-group'], styles['field-card']].join(' ')}>
          <label className={styles['form-label']} htmlFor="paper-translation-model">
            {t('settings.paperReader.translationModel')}
          </label>
          <select
            id="paper-translation-model"
            className="sm-input"
            value={localConfig.translationModel ?? ''}
            onChange={(e) =>
              setLocalConfig((prev) => ({
                ...prev,
                translationModel: e.target.value || undefined
              }))
            }
          >
            {translationModelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles['form-actions']}>
          <div className={styles['form-actions__buttons']}>
            <button
              className="sm-button sm-button--primary"
              disabled={!translationHasChanges}
              onClick={handleSaveTranslation}
            >
              {t('common.saveConfig')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
