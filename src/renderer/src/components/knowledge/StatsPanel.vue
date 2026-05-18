<script setup lang="ts">
import type { KnowledgeBase } from '@renderer/types'
import EmbeddingModelInfo from './EmbeddingModelInfo.vue'
import styles from './StatsPanel.module.css'

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
  <div :class="styles['kb-stats']">
    <EmbeddingModelInfo :current-k-b="currentKB" />
    <div :class="styles['stat-card']">
      <span :class="styles['stat-label']">向量维度</span>
      <span :class="styles['stat-value']">{{ currentKB.embeddingDimension }}</span>
    </div>
    <div :class="styles['stat-card']">
      <span :class="styles['stat-label']">分块大小</span>
      <span :class="styles['stat-value']">{{ currentKB.chunkSize }}</span>
    </div>
    <div :class="styles['stat-card']">
      <span :class="styles['stat-label']">已索引文件</span>
      <span :class="styles['stat-value']">{{ loadingStats ? '...' : stats.fileCount }}</span>
    </div>
    <div :class="styles['stat-card']">
      <span :class="styles['stat-label']">文档块</span>
      <span :class="styles['stat-value']">{{ loadingStats ? '...' : stats.chunkCount }}</span>
    </div>
    <div :class="styles['stat-card']">
      <span :class="styles['stat-label']">数据库大小</span>
      <span :class="styles['stat-value']">{{
        loadingStats ? '...' : formatDBSize(stats.dbSize)
      }}</span>
    </div>
  </div>
</template>
