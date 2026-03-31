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
    <div class="stat-card">
      <span class="stat-label">向量维度</span>
      <span class="stat-value">{{ currentKB.embeddingDimension }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">分块大小</span>
      <span class="stat-value">{{ currentKB.chunkSize }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">已索引文件</span>
      <span class="stat-value">{{ loadingStats ? '...' : stats.fileCount }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">文档块</span>
      <span class="stat-value">{{ loadingStats ? '...' : stats.chunkCount }}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">数据库大小</span>
      <span class="stat-value">{{ loadingStats ? '...' : formatDBSize(stats.dbSize) }}</span>
    </div>
  </div>
</template>

<style scoped>
.kb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--sm-space-3);
  padding-top: var(--sm-space-4);
  border-top: 1px solid var(--sm-color-border-subtle);
}

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
}
</style>
