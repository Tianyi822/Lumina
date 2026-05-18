<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { KnowledgeBase, EmbeddingConfig } from '@renderer/types'
import styles from './EmbeddingModelInfo.module.css'

const props = defineProps<{
  currentKB: KnowledgeBase
}>()

const embeddingModels = ref<Record<string, EmbeddingConfig>>({})
const loadingEmbeddingModels = ref(false)

async function loadEmbeddingModels(): Promise<void> {
  loadingEmbeddingModels.value = true
  try {
    const result = await window.api.embeddingModels.getAll()
    if (result.success && result.data) {
      embeddingModels.value = result.data
    }
  } catch (error) {
    window.api.logger.error('[EmbeddingModelInfo] 加载嵌入模型配置失败', {
      error: error instanceof Error ? error.message : String(error),
      kbId: props.currentKB.id
    })
  } finally {
    loadingEmbeddingModels.value = false
  }
}

const embeddingModelDisplayName = computed(() => {
  const kb = props.currentKB
  if (!kb) return ''

  if (kb.embeddingConfig.displayName?.trim()) {
    return kb.embeddingConfig.displayName
  }

  const modelConfigs = Object.values(embeddingModels.value)
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
})

onMounted(() => {
  loadEmbeddingModels()
})
</script>

<template>
  <div :class="[styles['stat-card'], styles['stat-card--wide']]">
    <span :class="styles['stat-label']">嵌入模型</span>
    <span :class="styles['stat-value']">{{
      embeddingModelDisplayName || (loadingEmbeddingModels ? '...' : '')
    }}</span>
  </div>
</template>
