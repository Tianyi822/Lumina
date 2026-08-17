import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@renderer/stores/configStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { notifySuccess, notifyError, notifyWarning } from '@renderer/composables/notificationCore'
import type { LLMConfig } from '@shared/types/config'
import ModelApiKeyInput from './ModelApiKeyInput'
import styles from './ModelSettings.module.css'

const EMPTY_NEW_MODEL: LLMConfig = { base_url: '', api_key: '', model_name: '' }

/** 对话模型配置页面：管理 LLM 列表、默认模型、新增/删除/测试连接 */
export default function ModelSettings() {
  // Zustand selectors
  const llmConfigs = useConfigStore((s) => s.llmConfigs)
  const defaultModel = useConfigStore((s) => s.defaultModel)
  const saving = useConfigStore((s) => s.saving)
  const updateLLMConfigs = useConfigStore((s) => s.updateLLMConfigs)
  const updateDefaultModel = useConfigStore((s) => s.updateDefaultModel)
  const notifyConfigUpdate = useUIStateStore((s) => s.notifyConfigUpdate)
  const { t } = useTranslation()

  // UI 状态：展开的模型索引集合、新增表单、测试中的索引
  const [expandedModels, setExpandedModels] = useState<Set<number>>(new Set())
  const [showNewModelForm, setShowNewModelForm] = useState(false)
  const [newModelConfig, setNewModelConfig] = useState<LLMConfig>({ ...EMPTY_NEW_MODEL })
  const [testingModelIndex, setTestingModelIndex] = useState<number | null>(null)
  const [testingNewModel, setTestingNewModel] = useState(false)

  // Auto-save 互斥锁，防止并发保存
  const autoSavePending = useRef(false)
  const autoSaveRunning = useRef(false)

  // 辅助函数
  const getModelItemName = useCallback(
    (config: LLMConfig, index: number): string => {
      return config.model_name.trim() || t('settings.model.nthModel', { index: index + 1 })
    },
    [t]
  )

  const validateModelConfig = useCallback(
    (config: LLMConfig, index: number): string => {
      // 字段显示名运行时取值，保证切换语言后校验消息同步
      function fieldLabel(field: 'base_url' | 'api_key' | 'model_name'): string {
        if (field === 'model_name') return t('notifications.settings.model.fieldModelName')
        return field === 'base_url' ? 'API Base URL' : 'API Key'
      }

      const requiredFields: Array<'base_url' | 'api_key' | 'model_name'> = [
        'base_url',
        'api_key',
        'model_name'
      ]

      for (const field of requiredFields) {
        if (!config[field].trim()) {
          return t('notifications.settings.model.validateFieldEmpty', {
            name: getModelItemName(config, index),
            field: fieldLabel(field)
          })
        }
      }

      return ''
    },
    [getModelItemName, t]
  )

  const validateAllModelConfigs = useCallback((): boolean => {
    const { llmConfigs: configs } = useConfigStore.getState()
    for (const [index, config] of configs.entries()) {
      // 任一模型配置校验不通过则提示并阻止操作
      const validationMessage = validateModelConfig(config, index)
      if (validationMessage) {
        notifyWarning(t('notifications.settings.model.validateFailedTitle'), validationMessage, {
          source: 'settings'
        })
        return false
      }
    }
    return true
  }, [validateModelConfig, t])

  // Auto-save 队列
  const flushAutoSaveQueue = useCallback(async () => {
    // 已有保存任务在执行，标记待重试并退出
    if (autoSaveRunning.current) {
      autoSavePending.current = true
      return
    }

    autoSaveRunning.current = true
    let shouldNotify = false

    try {
      // 循环执行保存，直到没有新的待处理请求（自动合并连续保存）
      do {
        autoSavePending.current = false
        if (!validateAllModelConfigs()) return

        const success = await useConfigStore.getState().saveConfig({ silent: true })
        if (success) shouldNotify = true
      } while (autoSavePending.current)
    } finally {
      autoSaveRunning.current = false
    }

    if (shouldNotify) {
      notifyConfigUpdate()
    }
  }, [validateAllModelConfigs, notifyConfigUpdate])

  const triggerAutoSave = useCallback(() => {
    void flushAutoSaveQueue()
  }, [flushAutoSaveQueue])

  // 模型操作
  const addNewModel = useCallback(() => {
    const { llmConfigs: configs } = useConfigStore.getState()
    const validationMessage = validateModelConfig(newModelConfig, configs.length)
    if (validationMessage) {
      notifyWarning(t('notifications.settings.model.validateFailedTitle'), validationMessage, {
        source: 'settings'
      })
      return
    }

    const newConfigs = [...configs, { ...newModelConfig }]
    updateLLMConfigs(newConfigs)
    // 展开新添加的模型详情面板
    setExpandedModels((prev) => new Set(prev).add(newConfigs.length - 1))

    // 第一个添加的模型自动设为默认模型
    if (newConfigs.length === 1) {
      updateDefaultModel(newModelConfig.model_name)
    }

    triggerAutoSave()
    setShowNewModelForm(false)
    setNewModelConfig({ ...EMPTY_NEW_MODEL })
  }, [
    newModelConfig,
    validateModelConfig,
    updateLLMConfigs,
    updateDefaultModel,
    triggerAutoSave,
    t
  ])

  const deleteModel = useCallback(
    (modelIndex: number) => {
      const { llmConfigs: configs, defaultModel: dm } = useConfigStore.getState()
      const modelName = configs[modelIndex]?.model_name
      if (modelName === undefined) return

      const newConfigs = configs.filter((_, index) => index !== modelIndex)
      updateLLMConfigs(newConfigs)

      // 删除后调整展开状态的索引：被删项之后的索引减 1
      setExpandedModels(
        (prev) =>
          new Set(
            Array.from(prev)
              .filter((index) => index !== modelIndex)
              .map((index) => (index > modelIndex ? index - 1 : index))
          )
      )

      // 若被删的是默认模型，将第一个可用模型设为默认
      if (dm === modelName) {
        updateDefaultModel(newConfigs.length > 0 ? newConfigs[0].model_name : '')
      }

      triggerAutoSave()
    },
    [updateLLMConfigs, updateDefaultModel, triggerAutoSave]
  )

  const toggleModelExpand = useCallback((modelIndex: number) => {
    setExpandedModels((prev) => {
      const next = new Set(prev)
      if (next.has(modelIndex)) {
        next.delete(modelIndex)
      } else {
        next.add(modelIndex)
      }
      return next
    })
  }, [])

  const setDefaultModel = useCallback(
    (modelName: string) => {
      if (useConfigStore.getState().defaultModel === modelName) return
      updateDefaultModel(modelName)
      triggerAutoSave()
    },
    [updateDefaultModel, triggerAutoSave]
  )

  const testModelConnection = useCallback(
    async (modelIndex: number) => {
      const config = useConfigStore.getState().llmConfigs[modelIndex]
      if (!config) return

      const validationMessage = validateModelConfig(config, modelIndex)
      if (validationMessage) {
        notifyWarning(t('notifications.settings.model.validateFailedTitle'), validationMessage, {
          source: 'settings'
        })
        return
      }

      setTestingModelIndex(modelIndex)
      try {
        // 调用主进程测试模型 API 连通性
        const result = await window.api.config.testModelConnection({ ...config })
        if (result.success) {
          notifySuccess(
            t('notifications.settings.model.testSuccessTitle'),
            t('notifications.settings.model.testSuccessMessage', {
              name: getModelItemName(config, modelIndex)
            }),
            { source: 'settings' }
          )
        } else {
          notifyError(
            t('notifications.settings.model.testFailedTitle'),
            result.error || t('notifications.settings.model.testFailedFallback'),
            { source: 'settings' }
          )
        }
      } catch (error) {
        notifyError(
          t('notifications.settings.model.testFailedTitle'),
          error instanceof Error ? error.message : String(error),
          { source: 'settings' }
        )
      } finally {
        setTestingModelIndex(null)
      }
    },
    [validateModelConfig, getModelItemName, t]
  )

  const testNewModelConnection = useCallback(async () => {
    const { llmConfigs: configs } = useConfigStore.getState()
    const validationMessage = validateModelConfig(newModelConfig, configs.length)
    if (validationMessage) {
      notifyWarning(t('notifications.settings.model.validateFailedTitle'), validationMessage, {
        source: 'settings'
      })
      return
    }

    setTestingNewModel(true)
    try {
      const result = await window.api.config.testModelConnection({ ...newModelConfig })
      if (result.success) {
        notifySuccess(
          t('notifications.settings.model.testSuccessTitle'),
          t('notifications.settings.model.testSuccessMessage', { name: newModelConfig.model_name }),
          { source: 'settings' }
        )
      } else {
        notifyError(
          t('notifications.settings.model.testFailedTitle'),
          result.error || t('notifications.settings.model.testFailedFallback'),
          { source: 'settings' }
        )
      }
    } catch (error) {
      notifyError(
        t('notifications.settings.model.testFailedTitle'),
        error instanceof Error ? error.message : String(error),
        { source: 'settings' }
      )
    } finally {
      setTestingNewModel(false)
    }
  }, [newModelConfig, validateModelConfig, t])

  const updateModelConfig = useCallback(
    (modelIndex: number, field: keyof LLMConfig, value: string) => {
      const { llmConfigs: configs, defaultModel: dm } = useConfigStore.getState()
      const currentConfig = configs[modelIndex]
      if (!currentConfig || currentConfig[field] === value) return

      const newConfigs = [...configs]
      newConfigs[modelIndex] = { ...currentConfig, [field]: value }

      updateLLMConfigs(newConfigs)

      // 更新模型名称时同步更新默认模型引用
      if (field === 'model_name' && dm === currentConfig.model_name) {
        updateDefaultModel(value)
      }

      triggerAutoSave()
    },
    [updateLLMConfigs, updateDefaultModel, triggerAutoSave]
  )

  // 保存配置
  const handleSave = useCallback(async () => {
    if (!validateAllModelConfigs()) return
    const success = await useConfigStore.getState().saveConfig()
    if (success) notifyConfigUpdate()
  }, [validateAllModelConfigs, notifyConfigUpdate])

  return (
    <div className={['sm-settings-page', 'tab-content'].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">{t('settings.model.title')}</h2>
        <p className="sm-settings-page__description">{t('settings.model.description')}</p>
      </header>

      <section className="sm-settings-page__section">
        <div className="sm-settings-page__section-header">
          <div className="sm-settings-page__section-title-row">
            <h3 className="sm-settings-page__section-title">{t('settings.model.listTitle')}</h3>
            <span
              className={['sm-settings-chip', llmConfigs.length > 0 && 'sm-settings-chip--accent']
                .filter(Boolean)
                .join(' ')}
            >
              {t('settings.model.defaultChip', {
                name: defaultModel || t('settings.model.noDefault')
              })}
            </span>
          </div>

          <button
            className="sm-button sm-button--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? t('common.saving') : t('common.saveConfig')}
          </button>
        </div>

        <div className={styles['model-list']}>
          {llmConfigs.map((config, index) => (
            <div key={index} className={styles['model-item']}>
              <div className={styles['model-header']} onClick={() => toggleModelExpand(index)}>
                <span className={styles['model-name']}>
                  {config.model_name || t('settings.model.unnamed')}
                </span>
                {defaultModel === config.model_name && (
                  <span className={styles['default-badge']}>
                    {t('settings.model.defaultBadge')}
                  </span>
                )}
                <span className={styles['expand-state']}>
                  {expandedModels.has(index) ? t('common.collapse') : t('common.expand')}
                </span>
                <div className={styles['model-actions']}>
                  <button
                    className="sm-button sm-button--small"
                    disabled={testingModelIndex === index}
                    onClick={(e) => {
                      e.stopPropagation()
                      void testModelConnection(index)
                    }}
                  >
                    {testingModelIndex === index ? t('common.testing') : t('common.test')}
                  </button>
                  {defaultModel !== config.model_name && (
                    <button
                      className="sm-button sm-button--small"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDefaultModel(config.model_name)
                      }}
                    >
                      {t('settings.model.setDefault')}
                    </button>
                  )}
                  <button
                    className={[
                      'sm-button',
                      'sm-button--small',
                      'sm-button--danger',
                      styles['model-action--danger']
                    ].join(' ')}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteModel(index)
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
              {expandedModels.has(index) && (
                <div className={styles['model-details']}>
                  <div className={styles['form-group']}>
                    <label>API Base URL</label>
                    <input
                      value={config.base_url}
                      type="text"
                      className="sm-input"
                      placeholder="https://api.openai.com/v1"
                      onChange={(e) => updateModelConfig(index, 'base_url', e.target.value)}
                    />
                  </div>
                  <div className={styles['form-group']}>
                    <label>API Key</label>
                    <ModelApiKeyInput
                      value={config.api_key}
                      onChange={(value) => updateModelConfig(index, 'api_key', value)}
                    />
                  </div>
                  <div className={styles['form-group']}>
                    <label>{t('settings.model.modelNameLabel')}</label>
                    <input
                      value={config.model_name}
                      type="text"
                      className="sm-input"
                      placeholder="gpt-4"
                      onChange={(e) => updateModelConfig(index, 'model_name', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {llmConfigs.length === 0 && !showNewModelForm && (
            <div className="sm-settings-empty">
              <p>{t('settings.model.empty')}</p>
            </div>
          )}
        </div>

        {showNewModelForm && (
          <div className={styles['new-model-form']}>
            <h3 className={styles['form-section-title']}>{t('settings.model.newFormTitle')}</h3>
            <div className={styles['form-group']}>
              <label>
                API Base URL <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                className="sm-input"
                placeholder="https://api.openai.com/v1"
                value={newModelConfig.base_url}
                onChange={(e) =>
                  setNewModelConfig((prev) => ({ ...prev, base_url: e.target.value }))
                }
              />
            </div>
            <div className={styles['form-group']}>
              <label>
                API Key <span className={styles.required}>*</span>
              </label>
              <ModelApiKeyInput
                value={newModelConfig.api_key}
                onChange={(value) => setNewModelConfig((prev) => ({ ...prev, api_key: value }))}
              />
            </div>
            <div className={styles['form-group']}>
              <label>
                {t('settings.model.modelNameLabel')} <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                className="sm-input"
                placeholder="gpt-4"
                value={newModelConfig.model_name}
                onChange={(e) =>
                  setNewModelConfig((prev) => ({ ...prev, model_name: e.target.value }))
                }
              />
            </div>
            <div className="form-actions">
              <button
                className="sm-button"
                onClick={() => {
                  setShowNewModelForm(false)
                  setNewModelConfig({ ...EMPTY_NEW_MODEL })
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                className="sm-button sm-button--secondary"
                disabled={testingNewModel}
                onClick={() => void testNewModelConnection()}
              >
                {testingNewModel ? t('common.testing') : t('common.testConnection')}
              </button>
              <button className="sm-button sm-button--primary" onClick={addNewModel}>
                {t('common.add')}
              </button>
            </div>
          </div>
        )}

        {!showNewModelForm && (
          <button
            className={['sm-button', styles['add-model-btn']].join(' ')}
            onClick={() => setShowNewModelForm(true)}
          >
            {t('settings.model.addModel')}
          </button>
        )}
      </section>
    </div>
  )
}
