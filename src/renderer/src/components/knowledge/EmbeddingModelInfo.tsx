import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { KnowledgeBase } from '@renderer/types'
import type { EmbeddingConfig } from '@shared/types/config'
import styles from './EmbeddingModelInfo.module.css'

/** 显示知识库关联的嵌入模型展示名，支持多级匹配回退 */
interface EmbeddingModelInfoProps {
  currentKB: KnowledgeBase
}

export default function EmbeddingModelInfo({ currentKB }: EmbeddingModelInfoProps) {
  const { t } = useTranslation()
  const [embeddingModels, setEmbeddingModels] = useState<Record<string, EmbeddingConfig>>({})
  const [loadingEmbeddingModels, setLoadingEmbeddingModels] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingEmbeddingModels(true)
      try {
        const result = await window.api.embeddingModels.getAll()
        if (!cancelled && result.success && result.data) {
          setEmbeddingModels(result.data)
        }
      } catch (error) {
        window.api.logger.error('[EmbeddingModelInfo] 加载嵌入模型配置失败', {
          error: error instanceof Error ? error.message : String(error),
          kbId: currentKB.id
        })
      } finally {
        if (!cancelled) setLoadingEmbeddingModels(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentKB.id])

  const displayName = (() => {
    const kb = currentKB
    if (!kb) return ''

    if (kb.embeddingConfig.displayName?.trim()) {
      return kb.embeddingConfig.displayName
    }

    const modelConfigs = Object.values(embeddingModels)

    const exactMatchedConfig = modelConfigs.find((modelConfig) => {
      return (
        modelConfig.baseUrl === kb.embeddingConfig.baseUrl &&
        modelConfig.model === kb.embeddingConfig.model &&
        modelConfig.dimensions === kb.embeddingConfig.dimensions &&
        (modelConfig.apiKey || '') === (kb.embeddingConfig.apiKey || '')
      )
    })

    if (exactMatchedConfig) {
      return exactMatchedConfig.displayName || exactMatchedConfig.model
    }

    const sameConfigMatched = modelConfigs.find((modelConfig) => {
      return (
        modelConfig.baseUrl === kb.embeddingConfig.baseUrl &&
        modelConfig.model === kb.embeddingConfig.model &&
        modelConfig.dimensions === kb.embeddingConfig.dimensions
      )
    })

    if (sameConfigMatched) {
      return sameConfigMatched.displayName || sameConfigMatched.model
    }

    const sameModelMatched = modelConfigs.find((modelConfig) => {
      return modelConfig.model === kb.embeddingConfig.model
    })

    if (sameModelMatched) {
      return sameModelMatched.displayName || sameModelMatched.model
    }

    return kb.embeddingConfig.model
  })()

  return (
    <div className={`${styles['stat-card']} ${styles['stat-card--wide']}`}>
      <span className={styles['stat-label']}>{t('knowledge.stats.embeddingModel')}</span>
      <span className={styles['stat-value']}>
        {displayName || (loadingEmbeddingModels ? '...' : '')}
      </span>
    </div>
  )
}
