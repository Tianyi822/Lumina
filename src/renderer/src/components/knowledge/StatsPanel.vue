<script setup lang="ts">
import type { KnowledgeBase } from '@renderer/types'
import EmbeddingModelInfo from './EmbeddingModelInfo.vue'

defineProps<{
  stats: { fileCount: number; chunkCount: number; dbSize: number }
  loadingStats: boolean
  currentKB: KnowledgeBase
}>()

function formatDBSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="kb-stats">
    <EmbeddingModelInfo :current-k-b="currentKB" />
    <div class="stat-item">
      <span class="stat-label">向量维度:</span>
      <span class="stat-value">{{ currentKB.embeddingDimension }}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">分块大小:</span>
      <span class="stat-value">{{ currentKB.chunkSize }}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">已索引文件:</span>
      <span class="stat-value">{{ loadingStats ? '...' : stats.fileCount }}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">文档块:</span>
      <span class="stat-value">{{ loadingStats ? '...' : stats.chunkCount }}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">数据库大小:</span>
      <span class="stat-value">{{ loadingStats ? '...' : formatDBSize(stats.dbSize) }}</span>
    </div>
  </div>
</template>

<style scoped>
/* 统计信息 */
.kb-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--theme-border);
}

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
