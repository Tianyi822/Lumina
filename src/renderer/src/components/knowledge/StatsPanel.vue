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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sm-space-2);
  margin-top: var(--sm-space-2);
}

.stat-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  white-space: nowrap;
}

.stat-label {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.stat-value {
  min-width: 0;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  font-family: var(--sm-font-mono);
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
