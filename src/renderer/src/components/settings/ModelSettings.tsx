import { useState, useRef, useCallback } from 'react'
import { useConfigStore } from '@renderer/stores/configStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { notifySuccess, notifyError, notifyWarning } from '@renderer/composables/notificationCore'
import type { LLMConfig } from '@shared/types/config'
import ModelApiKeyInput from './ModelApiKeyInput'
import styles from './ModelSettings.module.css'

const MODEL_FIELD_LABELS: Record<'base_url' | 'api_key' | 'model_name', string> = {
  base_url: 'API Base URL',
  api_key: 'API Key',
  model_name: '模型名称'
}

const EMPTY_NEW_MODEL: LLMConfig = { base_url: '', api_key: '', model_name: '' }

export default function ModelSettings() {
  // Zustand selectors
  const llmConfigs = useConfigStore((s) => s.llmConfigs)
  const defaultModel = useConfigStore((s) => s.defaultModel)
  const saving = useConfigStore((s) => s.saving)
  const updateLLMConfigs = useConfigStore((s) => s.updateLLMConfigs)
  const updateDefaultModel = useConfigStore((s) => s.updateDefaultModel)
  const notifyConfigUpdate = useUIStateStore((s) => s.notifyConfigUpdate)

  // UI 状态
  const [expandedModels, setExpandedModels] = useState<Set<number>>(new Set())
  const [showNewModelForm, setShowNewModelForm] = useState(false)
  const [newModelConfig, setNewModelConfig] = useState<LLMConfig>({ ...EMPTY_NEW_MODEL })
  const [testingModelIndex, setTestingModelIndex] = useState<number | null>(null)
  const [testingNewModel, setTestingNewModel] = useState(false)

  // Auto-save 互斥锁
  const autoSavePending = useRef(false)
  const autoSaveRunning = useRef(false)

  // 辅助函数
  const getModelItemName = useCallback((config: LLMConfig, index: number): string => {
    return config.model_name.trim() || `第 ${index + 1} 个模型`
  }, [])

  const validateModelConfig = useCallback(
    (config: LLMConfig, index: number): string => {
      const requiredFields: Array<keyof typeof MODEL_FIELD_LABELS> = [
        'base_url',
        'api_key',
        'model_name'
      ]

      for (const field of requiredFields) {
        if (!config[field].trim()) {
          return `模型配置"${getModelItemName(config, index)}"的 ${MODEL_FIELD_LABELS[field]} 不能为空`
        }
      }

      return ''
    },
    [getModelItemName]
  )

  const validateAllModelConfigs = useCallback((): boolean => {
    const { llmConfigs: configs } = useConfigStore.getState()
    for (const [index, config] of configs.entries()) {
      const validationMessage = validateModelConfig(config, index)
      if (validationMessage) {
        notifyWarning('模型配置校验失败', validationMessage, { source: 'settings' })
        return false
      }
    }
    return true
  }, [validateModelConfig])

  // Auto-save 队列
  const flushAutoSaveQueue = useCallback(async () => {
    if (autoSaveRunning.current) {
      autoSavePending.current = true
      return
    }

    autoSaveRunning.current = true
    let shouldNotify = false

    try {
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
      notifyWarning('模型配置校验失败', validationMessage, { source: 'settings' })
      return
    }

    const newConfigs = [...configs, { ...newModelConfig }]
    updateLLMConfigs(newConfigs)
    setExpandedModels((prev) => new Set(prev).add(newConfigs.length - 1))

    if (newConfigs.length === 1) {
      updateDefaultModel(newModelConfig.model_name)
    }

    triggerAutoSave()
    setShowNewModelForm(false)
    setNewModelConfig({ ...EMPTY_NEW_MODEL })
  }, [newModelConfig, validateModelConfig, updateLLMConfigs, updateDefaultModel, triggerAutoSave])

  const deleteModel = useCallback(
    (modelIndex: number) => {
      const { llmConfigs: configs, defaultModel: dm } = useConfigStore.getState()
      const modelName = configs[modelIndex]?.model_name
      if (modelName === undefined) return

      const newConfigs = configs.filter((_, index) => index !== modelIndex)
      updateLLMConfigs(newConfigs)

      setExpandedModels(
        (prev) =>
          new Set(
            Array.from(prev)
              .filter((index) => index !== modelIndex)
              .map((index) => (index > modelIndex ? index - 1 : index))
          )
      )

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
        notifyWarning('模型配置校验失败', validationMessage, { source: 'settings' })
        return
      }

      setTestingModelIndex(modelIndex)
      try {
        const result = await window.api.config.testModelConnection({ ...config })
        if (result.success) {
          notifySuccess('模型连接测试成功', `模型"${getModelItemName(config, modelIndex)}"可用`, {
            source: 'settings'
          })
        } else {
          notifyError('模型连接测试失败', result.error || '连接测试失败', { source: 'settings' })
        }
      } catch (error) {
        notifyError('模型连接测试失败', error instanceof Error ? error.message : String(error), {
          source: 'settings'
        })
      } finally {
        setTestingModelIndex(null)
      }
    },
    [validateModelConfig, getModelItemName]
  )

  const testNewModelConnection = useCallback(async () => {
    const { llmConfigs: configs } = useConfigStore.getState()
    const validationMessage = validateModelConfig(newModelConfig, configs.length)
    if (validationMessage) {
      notifyWarning('模型配置校验失败', validationMessage, { source: 'settings' })
      return
    }

    setTestingNewModel(true)
    try {
      const result = await window.api.config.testModelConnection({ ...newModelConfig })
      if (result.success) {
        notifySuccess('模型连接测试成功', `模型"${newModelConfig.model_name}"可用`, {
          source: 'settings'
        })
      } else {
        notifyError('模型连接测试失败', result.error || '连接测试失败', { source: 'settings' })
      }
    } catch (error) {
      notifyError('模型连接测试失败', error instanceof Error ? error.message : String(error), {
        source: 'settings'
      })
    } finally {
      setTestingNewModel(false)
    }
  }, [newModelConfig, validateModelConfig])

  const updateModelConfig = useCallback(
    (modelIndex: number, field: keyof LLMConfig, value: string) => {
      const { llmConfigs: configs, defaultModel: dm } = useConfigStore.getState()
      const currentConfig = configs[modelIndex]
      if (!currentConfig || currentConfig[field] === value) return

      const newConfigs = [...configs]
      newConfigs[modelIndex] = { ...currentConfig, [field]: value }

      updateLLMConfigs(newConfigs)

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
        <h2 className="sm-settings-page__title">对话模型配置</h2>
        <p className="sm-settings-page__description">
          管理对话模型列表和默认模型。修改字段后会自动同步到本地配置。
        </p>
      </header>

      <section className="sm-settings-page__section">
        <div className="sm-settings-page__section-header">
          <div className="sm-settings-page__section-title-row">
            <h3 className="sm-settings-page__section-title">模型列表</h3>
            <span
              className={['sm-settings-chip', llmConfigs.length > 0 && 'sm-settings-chip--accent']
                .filter(Boolean)
                .join(' ')}
            >
              默认模型: {defaultModel || '未设置'}
            </span>
          </div>

          <button
            className="sm-button sm-button--primary"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>

        <div className={styles['model-list']}>
          {llmConfigs.map((config, index) => (
            <div key={index} className={styles['model-item']}>
              <div className={styles['model-header']} onClick={() => toggleModelExpand(index)}>
                <span className={styles['model-name']}>{config.model_name || '未命名模型'}</span>
                {defaultModel === config.model_name && (
                  <span className={styles['default-badge']}>默认</span>
                )}
                <span className={styles['expand-state']}>
                  {expandedModels.has(index) ? '收起' : '展开'}
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
                    {testingModelIndex === index ? '测试中...' : '测试'}
                  </button>
                  {defaultModel !== config.model_name && (
                    <button
                      className="sm-button sm-button--small"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDefaultModel(config.model_name)
                      }}
                    >
                      设为默认
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
                    删除
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
                    <label>模型名称</label>
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
              <p>暂无模型配置</p>
            </div>
          )}
        </div>

        {showNewModelForm && (
          <div className={styles['new-model-form']}>
            <h3 className={styles['form-section-title']}>添加新模型配置</h3>
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
                模型名称 <span className={styles.required}>*</span>
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
                取消
              </button>
              <button
                className="sm-button sm-button--secondary"
                disabled={testingNewModel}
                onClick={() => void testNewModelConnection()}
              >
                {testingNewModel ? '测试中...' : '测试连接'}
              </button>
              <button className="sm-button sm-button--primary" onClick={addNewModel}>
                添加
              </button>
            </div>
          </div>
        )}

        {!showNewModelForm && (
          <button
            className={['sm-button', styles['add-model-btn']].join(' ')}
            onClick={() => setShowNewModelForm(true)}
          >
            添加模型配置
          </button>
        )}
      </section>
    </div>
  )
}
