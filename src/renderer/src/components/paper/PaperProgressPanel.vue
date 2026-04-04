<script setup lang="ts">
import { computed } from 'vue'
import type { OcrProgressInfo, PaperDocument } from '@shared/types/paper'

const props = defineProps<{
  progress: OcrProgressInfo | null
  paper: PaperDocument | null
  stage:
    | 'idle'
    | 'selecting'
    | 'loading'
    | 'rendering'
    | 'ocr_processing'
    | 'completed'
    | 'failed'
    | 'cancelled'
  renderingProgress?: {
    currentPage: number
    totalPages: number
    completedPages: number
    error?: string
  }
}>()

const emit = defineEmits<{
  cancel: []
  'retry-page': [pageIndex: number]
  'start-ocr': []
  'start-reading': []
}>()

// ==================== 计算属性 ====================

/** 进度百分比 */
const percent = computed(() => {
  if (props.progress && props.progress.totalPages > 0) {
    return Math.round((props.progress.completedPages / props.progress.totalPages) * 100)
  }
  if (props.renderingProgress?.totalPages) {
    return Math.round(
      (props.renderingProgress.completedPages / props.renderingProgress.totalPages) * 100
    )
  }
  return 0
})

/** 已完成页数 */
const completedCount = computed(() => {
  if (props.progress) return props.progress.completedPages
  if (props.renderingProgress) return props.renderingProgress.completedPages
  return 0
})

/** 总页数 */
const totalCount = computed(() => {
  if (props.progress) return props.progress.totalPages
  if (props.renderingProgress) return props.renderingProgress.totalPages
  return 0
})

/** 当前处理页码（用于状态消息） */
const currentPageNum = computed(() => {
  if (props.progress) return props.progress.currentPage + 1
  if (props.renderingProgress) return props.renderingProgress.currentPage + 1
  return 0
})

/** 状态消息文本 */
const statusMessage = computed(() => {
  switch (props.stage) {
    case 'idle':
      return '等待处理，点击下方按钮开始 OCR'
    case 'selecting':
      return '正在选择文件...'
    case 'loading':
      return '正在加载 PDF 文件...'
    case 'rendering':
      return `正在渲染第 ${currentPageNum.value}/${totalCount.value} 页...`
    case 'ocr_processing':
      return `正在对第 ${currentPageNum.value}/${totalCount.value} 页进行 OCR 识别...`
    case 'completed':
      return '所有页面处理完成！'
    case 'failed':
      return props.progress?.errorMessage || props.renderingProgress?.error || '处理失败，请重试'
    case 'cancelled':
      return '任务已取消'
    default:
      return ''
  }
})

/** 进度条填充颜色 */
const barColor = computed(() => {
  switch (props.stage) {
    case 'completed':
      return 'var(--sm-color-accent-active, #34d399)'
    case 'failed':
    case 'cancelled':
      return 'var(--sm-color-danger, #ef4444)'
    default:
      return 'var(--sm-color-primary, #6366f1)'
  }
})

/** 失败页列表 */
const failedPages = computed(() => props.progress?.failedPages || [])

/** 阶段标签文字 */
const stageLabel = computed(() => {
  const labels: Record<string, string> = {
    idle: '待处理',
    selecting: '选择文件',
    loading: '加载中',
    rendering: '渲染中',
    ocr_processing: 'OCR 识别中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }
  return labels[props.stage] || props.stage
})
</script>

<template>
  <div class="paper-progress-panel">
    <!-- 头部：文件名 + 状态标签 -->
    <div class="paper-progress-panel__header">
      <span class="paper-progress-panel__title" :title="paper?.fileName">
        {{ paper?.fileName || '未命名论文' }}
      </span>
      <span class="paper-progress-panel__stage-badge">{{ stageLabel }}</span>
    </div>

    <!-- 进度条区域 -->
    <div class="paper-progress-panel__progress">
      <div class="paper-progress-panel__bar-track">
        <div
          class="paper-progress-panel__bar-fill"
          :style="{ width: `${percent}%`, backgroundColor: barColor }"
        />
      </div>
      <!-- 统计文字 -->
      <div class="paper-progress-panel__stats">
        <span>{{ percent }}%</span>
        <span>{{ completedCount }} / {{ totalCount }} 页</span>
      </div>
    </div>

    <!-- 状态消息 -->
    <p class="paper-progress-panel__status">{{ statusMessage }}</p>

    <!-- 失败页列表 -->
    <div v-if="failedPages.length > 0" class="paper-progress-panel__details">
      <p class="paper-progress-panel__details-title">以下页面识别失败：</p>
      <div class="paper-progress-panel__failed-pages">
        <div
          v-for="pageIndex in failedPages"
          :key="pageIndex"
          class="paper-progress-panel__failed-page-item"
        >
          <span>第 {{ pageIndex + 1 }} 页</span>
          <button class="sm-button sm-button--sm" @click="emit('retry-page', pageIndex)">
            重试
          </button>
        </div>
      </div>
    </div>

    <!-- 操作按钮区 -->
    <div class="paper-progress-panel__actions">
      <!-- 处理中：取消按钮 -->
      <button
        v-if="
          stage === 'rendering' ||
          stage === 'ocr_processing' ||
          stage === 'selecting' ||
          stage === 'loading'
        "
        class="sm-button sm-button--danger"
        @click="emit('cancel')"
      >
        取消任务
      </button>

      <!-- 已完成：开始阅读 -->
      <button
        v-else-if="stage === 'completed'"
        class="sm-button sm-button--primary"
        @click="emit('start-reading')"
      >
        开始阅读
      </button>

      <!-- 待处理（draft/idle）：开始 OCR -->
      <button
        v-else-if="stage === 'idle'"
        class="sm-button sm-button--primary"
        @click="emit('start-ocr')"
      >
        开始 OCR
      </button>

      <!-- 失败：重新处理 -->
      <button
        v-else-if="stage === 'failed' || stage === 'cancelled'"
        class="sm-button sm-button--primary"
        @click="emit('start-ocr')"
      >
        重新处理
      </button>
    </div>
  </div>
</template>

<style scoped>
.paper-progress-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 480px;
  margin: auto;
  padding: var(--sm-space-6);
  background: var(--sm-color-surface-2);
  border-radius: var(--sm-radius-lg);
}

/* 头部 */
.paper-progress-panel__header {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  width: 100%;
  margin-bottom: var(--sm-space-5);
}

.paper-progress-panel__title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paper-progress-panel__stage-badge {
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

/* 进度条 */
.paper-progress-panel__progress {
  width: 100%;
  margin-bottom: var(--sm-space-3);
}

.paper-progress-panel__bar-track {
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--sm-color-surface-hover);
}

.paper-progress-panel__bar-fill {
  height: 100%;
  border-radius: 999px;
  transition:
    width 300ms ease,
    background-color 200ms ease;
}

/* 统计文字 */
.paper-progress-panel__stats {
  display: flex;
  justify-content: space-between;
  margin-top: var(--sm-space-2);
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

/* 状态消息 */
.paper-progress-panel__status {
  width: 100%;
  margin: 0 0 var(--sm-space-5);
  font-size: 13px;
  text-align: center;
  color: var(--sm-color-text-secondary);
}

/* 失败页详情 */
.paper-progress-panel__details {
  width: 100%;
  padding: var(--sm-space-4);
  margin-bottom: var(--sm-space-4);
  border-radius: var(--sm-radius-md);
  background: rgba(239, 68, 68, 0.08);
}

.paper-progress-panel__details-title {
  margin: 0 0 var(--sm-space-3);
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-danger, #ef4444);
}

.paper-progress-panel__failed-pages {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.paper-progress-panel__failed-page-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sm-space-2) var(--sm-space-3);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-1);
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}

/* 操作按钮区 */
.paper-progress-panel__actions {
  display: flex;
  gap: var(--sm-space-3);
}
</style>
