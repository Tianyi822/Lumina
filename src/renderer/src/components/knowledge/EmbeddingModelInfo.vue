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
    console.error('加载嵌入模型配置失败:', error)
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
  <div class="stat-item">
    <span class="stat-label">显示名称:</span>
    <span class="stat-value">{{
      embeddingModelDisplayName || (loadingEmbeddingModels ? '...' : '')
    }}</span>
  </div>
</template>

<style scoped>
.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.stat-label {
  color: var(--theme-text-secondary);
}

.stat-value {
  color: var(--theme-text);
  font-weight: 500;
  font-family: var(--font-mono);
}
</style>
