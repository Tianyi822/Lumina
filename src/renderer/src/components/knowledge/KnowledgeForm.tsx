import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { EmbeddingConfig } from '@shared/types/config'
import ModalPortal from '@renderer/components/ui/ModalPortal'
import styles from './KnowledgeForm.module.css'

/** 知识库创建表单提交数据 */
interface KnowledgeFormSubmitData {
  name: string
  description: string
  embeddingConfig: {
    baseUrl: string
    apiKey?: string
    displayName?: string
    model: string
    dimensions: number
  }
  embeddingDimension: number
  chunkSize: number
  chunkOverlap: number
}

interface KnowledgeFormProps {
  onSubmit: (data: KnowledgeFormSubmitData) => void
  onCancel: () => void
}

/** 知识库创建模态框，包含名称、嵌入模型选择和分块策略配置 */
export default function KnowledgeForm({ onSubmit, onCancel }: KnowledgeFormProps) {
  const { t } = useTranslation()

  /** 预置文本分块策略：随界面语言重取，故建于组件内 */
  const chunkStrategies = useMemo(
    () => [
      {
        name: t('knowledge.form.presetFineName'),
        size: 500,
        overlap: 100,
        desc: t('knowledge.form.presetFineDesc')
      },
      {
        name: t('knowledge.form.presetBalancedName'),
        size: 1000,
        overlap: 200,
        desc: t('knowledge.form.presetBalancedDesc')
      },
      {
        name: t('knowledge.form.presetLongName'),
        size: 2000,
        overlap: 400,
        desc: t('knowledge.form.presetLongDesc')
      }
    ],
    [t]
  )

  const [embeddingModels, setEmbeddingModels] = useState<Record<string, EmbeddingConfig>>({})
  const [loadingModels, setLoadingModels] = useState(true)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [embeddingModel, setEmbeddingModel] = useState('')
  const [chunkStrategy, setChunkStrategy] = useState(1)
  const [customChunkSize, setCustomChunkSize] = useState(1000)
  const [customChunkOverlap, setCustomChunkOverlap] = useState(200)
  const [useCustomChunk, setUseCustomChunk] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // 异步加载可用嵌入模型列表，加载后默认选中第一个
        const result = await window.api.embeddingModels.getAll()
        if (!cancelled && result.success && result.data) {
          setEmbeddingModels(result.data)
          const modelIds = Object.keys(result.data)
          if (modelIds.length > 0) {
            setEmbeddingModel(modelIds[0])
          }
        }
      } catch (error) {
        window.api.logger.error('[KnowledgeForm] 加载嵌入模型失败', {
          error: error instanceof Error ? error.message : String(error)
        })
      } finally {
        if (!cancelled) setLoadingModels(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // 表单有效性校验：名称不能为空且必须选中嵌入模型
  const isValid = useMemo(() => {
    if (name.trim().length === 0) return false
    if (embeddingModel === '') return false
    return true
  }, [name, embeddingModel])

  const selectedModelConfig = useMemo(
    () => embeddingModels[embeddingModel],
    [embeddingModels, embeddingModel]
  )

  // 重置表单到默认状态：清空输入、恢复第一个嵌入模型、恢复默认分块策略
  const resetForm = useCallback(() => {
    setName('')
    setDescription('')
    const modelIds = Object.keys(embeddingModels)
    setEmbeddingModel(modelIds.length > 0 ? modelIds[0] : '')
    setChunkStrategy(1)
    setCustomChunkSize(1000)
    setCustomChunkOverlap(200)
    setUseCustomChunk(false)
  }, [embeddingModels])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!isValid || !selectedModelConfig) return

      // 选择分块策略：使用自定义值或预置策略（精细检索/平衡/长上下文）
      let chunkSize: number
      let chunkOverlap: number

      if (useCustomChunk) {
        chunkSize = customChunkSize
        chunkOverlap = customChunkOverlap
      } else {
        const strategy = chunkStrategies[chunkStrategy]
        chunkSize = strategy.size
        chunkOverlap = strategy.overlap
      }

      const config = selectedModelConfig

      // 组装提交数据：嵌入模型配置 + 分块参数 + 基本信息
      onSubmit({
        name: name.trim(),
        description: description.trim(),
        embeddingConfig: {
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          displayName: config.displayName || embeddingModel,
          model: config.model,
          dimensions: config.dimensions
        },
        embeddingDimension: config.dimensions,
        chunkSize,
        chunkOverlap
      })

      resetForm()
    },
    [
      isValid,
      selectedModelConfig,
      useCustomChunk,
      customChunkSize,
      customChunkOverlap,
      chunkStrategies,
      chunkStrategy,
      name,
      description,
      embeddingModel,
      onSubmit,
      resetForm
    ]
  )

  const handleCancel = useCallback(() => {
    onCancel()
    resetForm()
  }, [onCancel, resetForm])

  return (
    <ModalPortal onBackdropClick={handleCancel}>
      <div
        className={`sm-modal__surface ${styles['form-container']}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`sm-pane-header ${styles['form-header']}`}>
          <h2>{t('knowledge.form.title')}</h2>
          <button className="sm-icon-button close-btn" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <form className={styles['form-body']} onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="kb-name">{t('knowledge.form.nameLabel')}</label>
            <input
              id="kb-name"
              value={name}
              type="text"
              className="sm-input"
              placeholder={t('knowledge.form.namePlaceholder')}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="kb-description">{t('knowledge.form.descriptionLabel')}</label>
            <textarea
              id="kb-description"
              value={description}
              className="sm-textarea"
              rows={3}
              placeholder={t('knowledge.form.descriptionPlaceholder')}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="kb-model">{t('knowledge.form.modelLabel')}</label>
            <select
              id="kb-model"
              value={embeddingModel}
              className="sm-select"
              disabled={loadingModels}
              onChange={(e) => setEmbeddingModel(e.target.value)}
            >
              {loadingModels ? (
                <option value="" disabled>
                  {t('common.loading')}
                </option>
              ) : Object.keys(embeddingModels).length === 0 ? (
                <option value="" disabled>
                  {t('knowledge.form.modelEmpty')}
                </option>
              ) : null}
              {Object.entries(embeddingModels).map(([id, model]) => (
                <option key={id} value={id}>
                  {model.displayName || model.model} (
                  {t('knowledge.form.modelDimensions', { dimensions: model.dimensions })})
                </option>
              ))}
            </select>
            <div className={`form-hint ${styles['form-hint']}`}>
              {t('knowledge.form.modelHint')}
            </div>
          </div>

          <div className="form-group">
            <label>{t('knowledge.form.chunkLabel')}</label>
            <div className={styles['strategy-options']}>
              {chunkStrategies.map((strategy, index) => (
                <label
                  key={index}
                  className={`${styles['strategy-option']} ${!useCustomChunk && chunkStrategy === index ? styles.active : ''}`}
                >
                  <input
                    type="radio"
                    name="chunk-strategy"
                    checked={!useCustomChunk && chunkStrategy === index}
                    onChange={() => {
                      setChunkStrategy(index)
                      setUseCustomChunk(false)
                    }}
                  />
                  <div className={styles['strategy-info']}>
                    <div className={styles['strategy-name']}>{strategy.name}</div>
                    <div className={styles['strategy-params']}>
                      {strategy.size} tokens / {strategy.overlap} overlap
                    </div>
                    <div className={styles['strategy-desc']}>{strategy.desc}</div>
                  </div>
                </label>
              ))}
              <label
                className={`${styles['strategy-option']} ${useCustomChunk ? styles.active : ''}`}
              >
                <input
                  type="radio"
                  name="chunk-strategy"
                  checked={useCustomChunk}
                  onChange={() => setUseCustomChunk(true)}
                />
                <div className={styles['strategy-info']}>
                  <div className={styles['strategy-name']}>{t('knowledge.form.customName')}</div>
                  {!useCustomChunk ? (
                    <div className={styles['strategy-desc']}>{t('knowledge.form.customDesc')}</div>
                  ) : (
                    <div className={styles['custom-inputs']}>
                      <div className={styles['custom-input']}>
                        <label>{t('knowledge.form.chunkSize')}</label>
                        <input
                          value={customChunkSize}
                          type="number"
                          min={100}
                          max={8000}
                          step={100}
                          className="sm-input"
                          onChange={(e) => setCustomChunkSize(Number(e.target.value))}
                        />
                        <span className={styles.unit}>tokens</span>
                      </div>
                      <div className={styles['custom-input']}>
                        <label>{t('knowledge.form.overlapSize')}</label>
                        <input
                          value={customChunkOverlap}
                          type="number"
                          min={0}
                          max={2000}
                          step={50}
                          className="sm-input"
                          onChange={(e) => setCustomChunkOverlap(Number(e.target.value))}
                        />
                        <span className={styles.unit}>tokens</span>
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </div>
            <div className={`form-hint ${styles['form-hint']}`}>
              {t('knowledge.form.chunkHint')}
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="sm-button sm-button--secondary" onClick={handleCancel}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="sm-button sm-button--primary"
              disabled={!isValid || loadingModels}
            >
              {t('knowledge.form.submit')}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}
