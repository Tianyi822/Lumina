import { useState, useEffect } from 'react'
import type { EmbeddingConfig } from '@shared/types/config'
import { normalizeEmbeddingBaseUrl } from '@shared/utils/embeddingBaseUrl'
import styles from './EmbeddingModelForm.module.css'

interface EmbeddingModelFormProps {
  existingNames?: string[]
  editingName?: string
  editingConfig?: EmbeddingConfig | null
  onSubmit: (name: string, config: EmbeddingConfig) => void
  onCancel: () => void
  onTest: (config: EmbeddingConfig) => void
}

/** 验证向量维度，返回是否有效 */
function validateDimension(value: string): string {
  const num = Number(value)
  if (!value.trim()) return '请输入向量维度'
  if (isNaN(num)) return '请输入有效的数字'
  if (!Number.isInteger(num)) return '向量维度必须是整数'
  if (num <= 0) return '向量维度必须大于0'
  return ''
}

export default function EmbeddingModelForm({
  existingNames,
  editingName,
  editingConfig,
  onSubmit,
  onCancel,
  onTest
}: EmbeddingModelFormProps) {
  // 表单数据
  const [displayName, setDisplayName] = useState('')
  const [provider, setProvider] = useState<EmbeddingConfig['provider']>('custom')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [modelName, setModelName] = useState('')
  const [dimensions, setDimensions] = useState('1536')
  const [enabled, setEnabled] = useState(true)

  // 验证错误
  const [nameConflictError, setNameConflictError] = useState('')
  const [dimensionError, setDimensionError] = useState('')
  const [formError, setFormError] = useState('')

  // 如果是编辑模式，加载现有配置
  useEffect(() => {
    if (editingConfig && editingName) {
      setDisplayName(editingName)
      setProvider(editingConfig.provider || 'custom')
      setBaseUrl(editingConfig.baseUrl || '')
      setApiKey(editingConfig.apiKey || '')
      setModelName(editingConfig.model || '')
      setDimensions(String(editingConfig.dimensions || 1536))
      setEnabled(editingConfig.enabled !== false)
    }
  }, [editingConfig, editingName])

  // 监听显示名称变化，检查冲突
  useEffect(() => {
    if (!displayName.trim()) {
      setNameConflictError('')
      return
    }
    // 编辑模式下不与当前名称比较
    if (editingName === displayName) {
      setNameConflictError('')
      return
    }
    if (existingNames && existingNames.includes(displayName)) {
      setNameConflictError('该名称已被使用，请更换')
    } else {
      setNameConflictError('')
    }
  }, [displayName, editingName, existingNames])

  // 构建配置对象
  function buildConfig(): EmbeddingConfig {
    return {
      provider,
      baseUrl: normalizeEmbeddingBaseUrl(baseUrl),
      apiKey: apiKey.trim(),
      model: modelName.trim(),
      dimensions: parseInt(dimensions, 10),
      enabled,
      displayName: displayName.trim(),
      createdAt: editingConfig?.createdAt || new Date().toISOString()
    }
  }

  // 验证表单
  function validateForm(): string | null {
    if (!displayName.trim()) return '请输入显示名称'
    if (nameConflictError) return nameConflictError
    if (!baseUrl.trim()) return '请输入API基础URL'
    if (!apiKey.trim()) return '请输入API密钥'
    if (!modelName.trim()) return '请输入模型名称'
    const dimErr = validateDimension(dimensions)
    if (dimErr) return dimErr
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const error = validateForm()
    if (error) {
      setFormError(error)
      return
    }
    onSubmit(displayName.trim(), buildConfig())
  }

  function handleTestConnection() {
    const error = validateForm()
    if (error) {
      setFormError(error)
      return
    }
    onTest(buildConfig())
  }

  function handleDimensionChange(value: string) {
    setDimensions(value)
    setDimensionError(validateDimension(value))
  }

  return (
    <div className={styles['new-model-form']}>
      <h3 className={styles['form-section-title']}>{editingName ? '编辑' : '添加'}嵌入模型</h3>

      <form onSubmit={handleSubmit}>
        {/* 显示名称 */}
        <div className={styles['form-group']}>
          <label>
            显示名称 <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            className={['sm-input', nameConflictError && styles['input-error']]
              .filter(Boolean)
              .join(' ')}
            placeholder="例如: OpenAI Embedding Small"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          {nameConflictError && (
            <span className={styles['error-message']}>{nameConflictError}</span>
          )}
        </div>

        {/* API 基础URL */}
        <div className={styles['form-group']}>
          <label>
            API 基础URL <span className={styles.required}>*</span>
          </label>
          <input
            type="url"
            className="sm-input"
            placeholder="http://127.0.0.1:1234/v1（填到 /v1，不要含 /embeddings）"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>

        {/* API 密钥 */}
        <div className={styles['form-group']}>
          <label>
            API 密钥 <span className={styles.required}>*</span>
          </label>
          <input
            type="password"
            className="sm-input"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        {/* 模型名称 */}
        <div className={styles['form-group']}>
          <label>
            模型名称 <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            className="sm-input"
            placeholder="text-embedding-3-small"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
          />
        </div>

        {/* 向量维度 */}
        <div className={styles['form-group']}>
          <label>
            向量维度 <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            className={['sm-input', dimensionError && styles['input-error']]
              .filter(Boolean)
              .join(' ')}
            placeholder="1536"
            value={dimensions}
            onChange={(e) => handleDimensionChange(e.target.value)}
          />
          {dimensionError && <span className={styles['error-message']}>{dimensionError}</span>}
        </div>

        {/* 表单错误 */}
        {formError && (
          <div className={[styles['test-result'], styles.error].join(' ')}>{formError}</div>
        )}

        {/* 按钮组 */}
        <div className={styles['form-actions']}>
          <button type="button" className="sm-button" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="sm-button sm-button--secondary"
            onClick={handleTestConnection}
          >
            测试连接
          </button>
          <button type="submit" className="sm-button sm-button--primary">
            保存
          </button>
        </div>
      </form>
    </div>
  )
}
