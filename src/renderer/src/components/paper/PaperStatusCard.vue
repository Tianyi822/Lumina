<script setup lang="ts">
import { computed } from 'vue'
import type { PaperDocument } from '@shared/types/paper'

const props = defineProps<{
  paper: PaperDocument
}>()

const emit = defineEmits<{
  'start-ocr': []
  retry: []
  'upload-pdf': []
}>()

/** 当前状态 */
const status = computed(() => props.paper.status)

/** 是否为 draft 状态（渲染完成，等待 OCR） */
const isDraft = computed(() => status.value === 'draft')

/** 是否为 failed 状态 */
const isFailed = computed(() => status.value === 'failed')

/** 是否为 rendering 状态 */
const isRendering = computed(() => status.value === 'rendering')

/** 状态描述文字 */
const statusDescription = computed(() => {
  if (isDraft.value) return '渲染完成，等待 OCR 识别'
  if (isFailed.value) return props.paper.errorMessage || '处理过程中发生错误'
  if (isRendering.value)
    return `正在渲染第 ${props.paper.completedPageCount + 1} / ${props.paper.pageCount} 页...`
  return ''
})

/** 状态标签文字 */
const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    draft: '待识别',
    failed: '失败',
    rendering: '渲染中',
    ocr_processing: 'OCR 中',
    completed: '已完成',
    partial_failed: '部分完成'
  }
  return labels[status.value] || status.value
})
</script>

<template>
  <div class="paper-status-card">
    <!-- 文件名与状态 -->
    <div class="paper-status-card__header">
      <span class="paper-status-card__filename" :title="paper.fileName">
        {{ paper.fileName }}
      </span>
      <span class="paper-status-card__badge">{{ statusLabel }}</span>
    </div>

    <!-- 状态描述 -->
    <p class="paper-status-card__description">{{ statusDescription }}</p>

    <!-- 操作按钮 -->
    <div class="paper-status-card__actions">
      <!-- draft：开始 OCR -->
      <button v-if="isDraft" class="sm-button sm-button--primary" @click="emit('start-ocr')">
        开始识别
      </button>

      <!-- failed：重新处理 -->
      <template v-else-if="isFailed">
        <button class="sm-button sm-button--primary" @click="emit('start-ocr')">重新处理</button>
        <button class="sm-button sm-button--secondary" @click="emit('upload-pdf')">重新上传</button>
      </template>

      <!-- rendering：仅显示进度 -->
      <span v-else-if="isRendering" class="paper-status-card__rendering-hint">
        渲染中，请稍候...
      </span>
    </div>
  </div>
</template>

<style scoped>
.paper-status-card {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  max-width: 480px;
  margin: auto;
  padding: var(--sm-space-5);
  background: var(--sm-color-surface-2);
  border-radius: var(--sm-radius-lg);
}

/* 头部 */
.paper-status-card__header {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
}

.paper-status-card__filename {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paper-status-card__badge {
  flex-shrink: 0;
  padding: 2px var(--sm-space-2);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-secondary);
  white-space: nowrap;
}

/* 状态描述 */
.paper-status-card__description {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

/* 操作按钮区 */
.paper-status-card__actions {
  display: flex;
  gap: var(--sm-space-3);
  flex-wrap: wrap;
}

.paper-status-card__rendering-hint {
  font-size: 13px;
  color: var(--sm-color-text-tertiary);
}
</style>
