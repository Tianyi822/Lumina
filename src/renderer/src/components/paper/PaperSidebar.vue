<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { PaperDocument, PaperStatus } from '@shared/types/paper'

const props = defineProps<{
  papers: PaperDocument[]
  currentPaperId: string | null
}>()

const emit = defineEmits<{
  (e: 'select-paper', paperId: string): void
  (e: 'upload-pdf'): void
  (e: 'delete-paper', paperId: string): void
  (e: 'start-ocr', paperId: string): void
}>()

// 状态标签配置
const statusConfig: Record<PaperStatus, { label: string; colorClass: string }> = {
  completed: { label: '已完成', colorClass: 'paper-item__status-badge--completed' },
  rendering: { label: '渲染中', colorClass: 'paper-item__status-badge--processing' },
  ocr_processing: { label: '识别中', colorClass: 'paper-item__status-badge--processing' },
  draft: { label: '待处理', colorClass: 'paper-item__status-badge--draft' },
  failed: { label: '失败', colorClass: 'paper-item__status-badge--failed' },
  partial_failed: { label: '部分失败', colorClass: 'paper-item__status-badge--partial-failed' }
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 格式化时间（显示相对时间或简短日期）
function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`

  // 超过一周显示日期
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function handleSelectPaper(paperId: string): void {
  emit('select-paper', paperId)
}

function handleUploadPdf(): void {
  emit('upload-pdf')
}

function handleDeletePaper(paperId: string, event: Event): void {
  event.stopPropagation()
  emit('delete-paper', paperId)
}

function handleStartOcr(paperId: string, event: Event): void {
  event.stopPropagation()
  emit('start-ocr', paperId)
}
</script>

<template>
  <div class="paper-sidebar sm-sidebar-shell__body sm-sidebar-shell__body--flush">
    <div class="paper-list">
      <TransitionGroup name="paper-list-item" tag="div" appear>
        <div
          v-for="paper in papers"
          :key="paper.id"
          :class="['paper-item', { 'paper-item--active': paper.id === currentPaperId }]"
          @click="handleSelectPaper(paper.id)"
        >
            <!-- 图标区域：PDF 图标或首字母 -->
            <div class="paper-item__icon">
              <SvgIcon name="file-pdf" :size="18" />
            </div>

            <!-- 信息区 -->
            <div class="paper-item__info">
              <div class="paper-item__name" :title="paper.fileName">{{ paper.fileName }}</div>
              <div class="paper-item__meta">
                <span>{{ paper.pageCount }} 页</span>
                <span class="paper-item__meta-sep">·</span>
                <span>{{ formatFileSize(paper.fileSize) }}</span>
                <span class="paper-item__meta-sep">·</span>
                <span>{{ formatTime(paper.updatedAt) }}</span>
              </div>
            </div>

            <!-- 状态标签 -->
            <span
              v-if="paper.status !== 'completed'"
              :class="['paper-item__status-badge', statusConfig[paper.status]?.colorClass || '']"
            >
              {{ statusConfig[paper.status]?.label || paper.status }}
            </span>

            <!-- 删除按钮（hover 显示） -->
            <button
              class="paper-item__delete-btn"
              title="删除论文"
              @click="handleDeletePaper(paper.id, $event)"
            >
              <SvgIcon name="trash" :size="14" />
            </button>

            <!-- 开始 OCR 按钮（仅 draft 状态时 hover 显示） -->
            <button
              v-if="paper.status === 'draft'"
              class="paper-item__ocr-btn"
              title="开始 OCR 识别"
              @click="handleStartOcr(paper.id, $event)"
            >
              <SvgIcon name="play" :size="12" />
            </button>
          </div>
        </TransitionGroup>

        <!-- 空状态提示 -->
        <div v-if="papers.length === 0" class="paper-list__empty">
          <div class="paper-list__empty-text">暂无论文</div>
          <button
            class="sm-button sm-button--secondary sm-button--small"
            @click="handleUploadPdf"
          >
            上传第一篇 PDF
          </button>
        </div>
    </div>
  </div>
</template>

<style scoped>
/* 论文列表容器 */
.paper-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* 列表项 */
.paper-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.paper-item:hover {
  background-color: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.paper-item--active {
  background-color: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
}

/* 图标 */
.paper-item__icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: 8px;
  color: var(--sm-color-text-secondary);
  flex-shrink: 0;
}

/* 信息区 */
.paper-item__info {
  flex: 1;
  min-width: 0;
}

.paper-item__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.paper-item__meta {
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.paper-item__meta-sep {
  opacity: 0.5;
}

/* 状态标签 */
.paper-item__status-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.4;
}

.paper-item__status-badge--completed {
  color: #5fb878;
  background-color: rgba(95, 184, 120, 0.12);
}

.paper-item__status-badge--processing {
  color: #6b9fff;
  background-color: rgba(107, 159, 255, 0.12);
}

.paper-item__status-badge--draft {
  color: var(--sm-color-text-tertiary);
  background-color: var(--sm-color-surface-2);
}

.paper-item__status-badge--failed {
  color: #e06c6c;
  background-color: rgba(224, 108, 108, 0.12);
}

.paper-item__status-badge--partial-failed {
  color: #e6a23c;
  background-color: rgba(230, 162, 60, 0.12);
}

/* 删除按钮 */
.paper-item__delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--sm-color-text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  z-index: 1;
}

.paper-item:hover .paper-item__delete-btn {
  opacity: 1;
}

.paper-item__delete-btn:hover {
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: rgba(199, 120, 120, 0.92);
}

/* OCR 按钮 */
.paper-item__ocr-btn {
  position: absolute;
  bottom: 6px;
  right: 8px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--sm-color-text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  z-index: 1;
}

.paper-item:hover .paper-item__ocr-btn {
  opacity: 1;
}

.paper-item__ocr-btn:hover {
  background-color: rgba(107, 159, 255, 0.12);
  border-color: rgba(107, 159, 255, 0.28);
  color: #6b9fff;
}

/* 空状态 */
.paper-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.paper-list__empty-text {
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}

/* TransitionGroup 动画 */
.paper-list-item-enter-active {
  transition: all 0.25s ease-out;
}

.paper-list-item-leave-active {
  transition: all 0.2s ease-in;
}

.paper-list-item-enter-from {
  opacity: 0;
  transform: translateX(-12px);
}

.paper-list-item-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

.paper-list-item-move {
  transition: transform 0.25s ease;
}
</style>
