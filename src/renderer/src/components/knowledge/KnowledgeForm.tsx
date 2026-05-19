import { useState, useEffect, useCallback, useMemo } from 'react'
import type { EmbeddingConfig } from '@shared/types/config'
import styles from './knowledge/KnowledgeForm.module.css'

const chunkStrategies = [
  { name: '精细检索', size: 500, overlap: 100, desc: '适合代码、法律条文，精确匹配' },
  { name: '平衡模式', size: 1000, overlap: 200, desc: '通用场景，推荐' },
  { name: '长上下文', size: 2000, overlap: 400, desc: '适合论文、小说，保持段落完整' }
]

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

export default function KnowledgeForm({ onSubmit, onCancel }: KnowledgeFormProps) {
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

  const isValid = useMemo(() => {
    if (name.trim().length === 0) return false
    if (embeddingModel === '') return false
    return true
  }, [name, embeddingModel])

  const selectedModelConfig = useMemo(
    () => embeddingModels[embeddingModel],
    [embeddingModels, embeddingModel]
  )

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
    <div className={`sm-modal__overlay ${styles['form-overlay']}`} onClick={handleCancel}>
      <div
        className={`sm-modal__surface ${styles['form-container']}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`sm-pane-header ${styles['form-header']}`}>
          <h2>创建知识库</h2>
          <button className="sm-icon-button close-btn" onClick={handleCancel}>
            ✕
          </button>
        </div>

        <form className={styles['form-body']} onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="kb-name">知识库名称 *</label>
            <input
              id="kb-name"
              value={name}
              type="text"
              className="sm-input"
              placeholder="例如：产品文档、技术规范..."
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="kb-description">描述（可选）</label>
            <textarea
              id="kb-description"
              value={description}
              className="sm-textarea"
              rows={3}
              placeholder="简要描述这个知识库的用途..."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="kb-model">嵌入模型 *</label>
            <select
              id="kb-model"
              value={embeddingModel}
              className="sm-select"
              disabled={loadingModels}
              onChange={(e) => setEmbeddingModel(e.target.value)}
            >
              {loadingModels ? (
                <option value="" disabled>
                  加载中...
                </option>
              ) : Object.keys(embeddingModels).length === 0 ? (
                <option value="" disabled>
                  暂无可用模型，请先在设置中配置嵌入模型
                </option>
              ) : null}
              {Object.entries(embeddingModels).map(([id, model]) => (
                <option key={id} value={id}>
                  {model.displayName || model.model} ({model.dimensions} 维)
                </option>
              ))}
            </select>
            <div className={`form-hint ${styles['form-hint']}`}>
              嵌入模型用于将文本转换为向量，支持语义搜索。创建后不可更改。
            </div>
          </div>

          <div className="form-group">
            <label>分块策略</label>
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
                  <div className={styles['strategy-name']}>自定义</div>
                  {!useCustomChunk ? (
                    <div className={styles['strategy-desc']}>手动设置分块参数</div>
                  ) : (
                    <div className={styles['custom-inputs']}>
                      <div className={styles['custom-input']}>
                        <label>块大小</label>
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
                        <label>重叠大小</label>
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
              文本分块策略影响检索精度，创建后不可更改。
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="sm-button sm-button--secondary" onClick={handleCancel}>
              取消
            </button>
            <button
              type="submit"
              className="sm-button sm-button--primary"
              disabled={!isValid || loadingModels}
            >
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
