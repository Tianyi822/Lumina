import { useState, useMemo, useEffect, useCallback } from 'react'
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

export default function PaperReaderSettings() {
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
    const defaultLabel = defaultModel ? `使用默认模型（${defaultModel}）` : '使用默认模型'
    const options = [{ label: defaultLabel, value: '' }]
    for (const model of llmConfigs) {
      options.push({
        label: model.model_name + (model.model_name === defaultModel ? ' (默认)' : ''),
        value: model.model_name
      })
    }
    return options
  }, [defaultModel, llmConfigs])

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
      notifyError('论文阅读配置', '请先填写 API Key', { source: 'settings' })
      return
    }

    setTesting(true)
    try {
      const result = await window.api.paper.testOcrConnection({
        provider: localConfig.ocr.provider,
        apiKey: localConfig.ocr.apiKey ?? ''
      })

      if (result.success) {
        notifySuccess('论文阅读配置', '连接测试成功，请点击保存配置以生效', { source: 'settings' })
      } else {
        notifyError('论文阅读配置', result.error ?? '连接测试失败', { source: 'settings' })
      }
    } catch (error) {
      notifyError(
        '论文阅读配置',
        `测试失败: ${error instanceof Error ? error.message : String(error)}`,
        {
          source: 'settings'
        }
      )
    } finally {
      setTesting(false)
    }
  }, [localConfig.ocr])

  // 保存 OCR 配置
  const handleSaveOcr = useCallback(async () => {
    const plainConfig = buildPlainConfig()
    updatePaperReaderConfig(plainConfig)
    const success = await saveConfig({ silent: true })
    if (!success) {
      notifyError('论文阅读配置', '保存失败', { source: 'settings' })
      return
    }
    notifyConfigUpdate()
    notifySuccess('论文阅读配置', 'OCR 配置已保存', { source: 'settings' })
  }, [buildPlainConfig, updatePaperReaderConfig, saveConfig, notifyConfigUpdate])

  // 保存翻译模型配置
  const handleSaveTranslation = useCallback(async () => {
    const plainConfig = buildPlainConfig()
    updatePaperReaderConfig(plainConfig)
    const success = await saveConfig({ silent: true })
    if (!success) {
      notifyError('论文阅读配置', '保存失败', { source: 'settings' })
      return
    }
    notifyConfigUpdate()
    notifySuccess('论文阅读配置', '翻译模型配置已保存', { source: 'settings' })
  }, [buildPlainConfig, updatePaperReaderConfig, saveConfig, notifyConfigUpdate])

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
        <h2 className="sm-settings-page__title">OCR 配置</h2>
        <p className="sm-settings-page__description">选择 OCR 服务提供商并配置对应的凭据。</p>
      </header>

      <section className="sm-settings-page__section">
        <div className={[styles['form-group'], styles['field-card']].join(' ')}>
          <label className={styles['form-label']} htmlFor="paper-ocr-provider">
            OCR 服务
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
            <label className={styles['form-label']}>模型名称</label>
            <div className={styles['provider-display']}>{currentPreset?.modelName ?? '-'}</div>
          </div>

          <div className={[styles['form-group'], styles['field-card'], styles['flex-1']].join(' ')}>
            <label className={styles['form-label']}>
              并发数
              <span className={styles['field-hint']}>由该模型官方限制，不允许更改</span>
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
                  获取 API KEY
                </a>
              )}
            </label>
            <input
              type="password"
              className="sm-input"
              placeholder="填写对应的 API Key"
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
          <label className={styles['form-label']}>请求地址</label>
          <div className={styles['provider-display']}>{currentPreset?.url ?? '-'}</div>
        </div>

        <div className={styles['form-actions']}>
          <div className={styles['form-actions__buttons']}>
            <button
              className="sm-button sm-button--secondary"
              disabled={!canTest}
              onClick={handleTestConnection}
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button
              className="sm-button sm-button--primary"
              disabled={!ocrHasChanges}
              onClick={handleSaveOcr}
            >
              保存配置
            </button>
          </div>
        </div>
      </section>

      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">翻译模型配置</h2>
        <p className="sm-settings-page__description">
          选择用于论文翻译的 LLM 模型。翻译需要上下文关联能力，只能从已配置的对话模型中选择。
        </p>
      </header>

      <section className="sm-settings-page__section">
        <div className={[styles['form-group'], styles['field-card']].join(' ')}>
          <label className={styles['form-label']} htmlFor="paper-translation-model">
            翻译模型
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
              保存配置
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
