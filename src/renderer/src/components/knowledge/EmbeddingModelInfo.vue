<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { KnowledgeBase, EmbeddingConfig } from '@renderer/types'

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
  <div class="stat-card stat-card--wide">
    <span class="stat-label">嵌入模型</span>
    <span class="stat-value">{{
      embeddingModelDisplayName || (loadingEmbeddingModels ? '...' : '')
    }}</span>
  </div>
</template>

<style scoped>
.stat-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 88px;
  padding: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  background: rgba(255, 255, 255, 0.02);
}

.stat-card--wide {
  min-width: 0;
}

.stat-label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.stat-value {
  color: var(--sm-color-text-primary);
  font-size: 15px;
  font-weight: 500;
  font-family: var(--sm-font-mono);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
