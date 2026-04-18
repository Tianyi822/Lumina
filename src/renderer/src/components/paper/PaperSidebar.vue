<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { formatFileSize } from '@shared/utils'
import type { OcrProgressInfo, PaperDocument, PaperStatus } from '@shared/types/paper'
import type { RenderingProgress } from '@renderer/stores/paperReaderStore'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'

const props = defineProps<{
  papers: PaperDocument[]
  currentPaperId: string | null
  renderProgressByPaperId: Record<string, RenderingProgress>
  ocrProgressByPaperId: Record<string, OcrProgressInfo>
  hasTranslationByPaperId: Record<string, boolean>
}>()

const emit = defineEmits<{
  (e: 'select-paper', paperId: string): void
  (e: 'upload-pdf'): void
  (e: 'delete-paper', paperId: string): void
  (e: 'delete-translation', paperId: string): void
  (e: 'retry-paper', paperId: string): void
}>()

function isPaperReadable(paper: PaperDocument): boolean {
  return paper.status === 'completed'
}

function getRenderProgress(paper: PaperDocument): { completedPages: number; totalPages: number } {
  const progress = props.renderProgressByPaperId[paper.id]
  if (progress) {
    return {
      completedPages: progress.completedPages,
      totalPages: progress.totalPages || paper.pageCount
    }
  }

  return {
    completedPages: Math.min(paper.pageAssets?.length || 0, paper.pageCount),
    totalPages: paper.pageCount
  }
}

function formatRenderProgressText(paper: PaperDocument): string {
  const progress = getRenderProgress(paper)
  return `${progress.completedPages}/${progress.totalPages}`
}

function getRenderProgressPercent(paper: PaperDocument): number {
  const progress = getRenderProgress(paper)
  if (progress.totalPages === 0) return 0
  return Math.min(100, Math.round((progress.completedPages / progress.totalPages) * 100))
}

function getOcrProgress(paper: PaperDocument): {
  completedPages: number
  totalPages: number
  hint: string
} {
  const progress = props.ocrProgressByPaperId[paper.id]
  if (progress) {
    const hintMap: Record<OcrProgressInfo['status'], string> = {
      idle: '待开始',
      processing: '处理中',
      completed: '已完成',
      partial_failed: '部分失败',
      failed: '失败',
      cancelled: '已取消'
    }

    return {
      completedPages: progress.completedPages,
      totalPages: progress.totalPages || paper.pageCount,
      hint: hintMap[progress.status]
    }
  }

  const fallbackHintMap: Record<PaperStatus, string> = {
    draft: '待开始',
    rendering: '待开始',
    ocr_processing: '处理中',
    completed: '已完成',
    partial_failed: '部分失败',
    failed: '失败'
  }

  return {
    completedPages: paper.completedPageCount,
    totalPages: paper.pageCount,
    hint: fallbackHintMap[paper.status]
  }
}

function formatOcrProgressText(paper: PaperDocument): string {
  const progress = getOcrProgress(paper)
  return `${progress.completedPages}/${progress.totalPages}（${progress.hint}）`
}

function getOcrProgressPercent(paper: PaperDocument): number {
  const progress = getOcrProgress(paper)
  if (progress.totalPages === 0) return 0
  return Math.min(100, Math.round((progress.completedPages / progress.totalPages) * 100))
}

function shouldShowRenderProgress(paper: PaperDocument): boolean {
  return paper.status === 'rendering'
}

function shouldShowOcrProgress(paper: PaperDocument): boolean {
  return paper.status === 'ocr_processing'
}

function shouldShowRetry(paper: PaperDocument): boolean {
  return paper.status === 'failed' || paper.status === 'partial_failed'
}

function getRetryTitle(paper: PaperDocument): string {
  const renderProgress = props.renderProgressByPaperId[paper.id]
  if (renderProgress?.stage === 'failed') {
    return '截图阶段失败'
  }

  if (paper.status === 'partial_failed') {
    return 'OCR 部分失败'
  }

  return 'OCR 阶段失败'
}

function getRetryMessage(paper: PaperDocument): string {
  const renderProgress = props.renderProgressByPaperId[paper.id]
  if (renderProgress?.stage === 'failed') {
    return renderProgress.error || paper.errorMessage || '页图生成失败，请手动重试。'
  }

  const ocrProgress = props.ocrProgressByPaperId[paper.id]
  if (paper.status === 'partial_failed') {
    return '有页面识别失败，点击重试后会重新执行 OCR。'
  }

  return ocrProgress?.errorMessage || paper.errorMessage || 'OCR 执行失败，请手动重试。'
}

function getUnreadableText(paper: PaperDocument): string {
  if (shouldShowRetry(paper)) {
    return '处理失败，暂不可阅读'
  }

  if (paper.status === 'failed' || paper.status === 'partial_failed') {
    return '识别未完成，暂不可阅读'
  }

  return '处理中，暂不可阅读'
}

function handleSelectPaper(paper: PaperDocument): void {
  if (!isPaperReadable(paper)) {
    return
  }

  emit('select-paper', paper.id)
}

function handleDeletePaper(paperId: string, event: Event): void {
  event.stopPropagation()
  emit('delete-paper', paperId)
}

function handleRetryPaper(paperId: string, event: Event): void {
  event.stopPropagation()
  emit('retry-paper', paperId)
}

function hasTranslated(paperId: string): boolean {
  return props.hasTranslationByPaperId[paperId] === true
}

function handleDeleteTranslation(paperId: string, event: Event): void {
  event.stopPropagation()
  emit('delete-translation', paperId)
}
</script>

<template>
  <div class="paper-sidebar sm-sidebar-shell__body sm-sidebar-shell__body--flush">
    <div class="paper-list">
      <TransitionGroup name="sm-sidebar-list-item" tag="div" appear>
        <div
          v-for="(paper, index) in papers"
          :key="paper.id"
          :style="getSidebarListItemMotionStyle(index)"
          :class="[
            'paper-item',
            {
              'paper-item--active': paper.id === currentPaperId && isPaperReadable(paper),
              'paper-item--disabled': !isPaperReadable(paper)
            }
          ]"
          :aria-disabled="!isPaperReadable(paper)"
          @click="handleSelectPaper(paper)"
        >
          <div class="paper-item__icon">
            <SvgIcon name="file-pdf" :size="20" />
          </div>

          <div class="paper-item__info">
            <div class="paper-item__name" :title="paper.fileName">{{ paper.fileName }}</div>
            <div class="paper-item__meta-row">
              <div class="paper-item__meta">
                <span>{{ paper.pageCount }} 页</span>
                <span class="paper-item__meta-sep">·</span>
                <span>{{ formatFileSize(paper.fileSize) }}</span>
              </div>

              <button
                v-if="hasTranslated(paper.id)"
                class="paper-item__translation-tag"
                type="button"
                title="点击删除翻译内容"
                @click="handleDeleteTranslation(paper.id, $event)"
              >
                <span class="paper-item__translation-tag-default">有译文</span>
                <span class="paper-item__translation-tag-delete">删除翻译</span>
              </button>
            </div>

            <div v-if="shouldShowRenderProgress(paper)" class="paper-item__progress">
              <div class="paper-item__progress-line">
                <span class="paper-item__progress-label">截图进度</span>
                <span>{{ formatRenderProgressText(paper) }}</span>
              </div>
              <div class="paper-item__progress-track">
                <span
                  class="paper-item__progress-fill paper-item__progress-fill--render"
                  :style="{ width: `${getRenderProgressPercent(paper)}%` }"
                />
              </div>
            </div>

            <div v-else-if="shouldShowOcrProgress(paper)" class="paper-item__progress">
              <div class="paper-item__progress-line">
                <span class="paper-item__progress-label">OCR 进度</span>
                <span>{{ formatOcrProgressText(paper) }}</span>
              </div>
              <div class="paper-item__progress-track">
                <span
                  class="paper-item__progress-fill paper-item__progress-fill--ocr"
                  :style="{ width: `${getOcrProgressPercent(paper)}%` }"
                />
              </div>
            </div>

            <div v-if="shouldShowRetry(paper)" class="paper-item__retry">
              <div class="paper-item__retry-title">{{ getRetryTitle(paper) }}</div>
              <div class="paper-item__retry-message">{{ getRetryMessage(paper) }}</div>
              <button
                class="paper-item__retry-btn"
                type="button"
                @click="handleRetryPaper(paper.id, $event)"
              >
                重试
              </button>
            </div>

            <div v-if="!isPaperReadable(paper)" class="paper-item__unreadable">
              {{ getUnreadableText(paper) }}
            </div>
          </div>

          <div class="paper-item__actions">
            <button
              class="paper-item__delete-btn"
              title="删除论文"
              type="button"
              @click="handleDeletePaper(paper.id, $event)"
            >
              <SvgIcon name="trash" :size="14" />
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.paper-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 12px;
}

.paper-list::-webkit-scrollbar {
  display: none;
}

.paper-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 12px;
  margin-bottom: 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    opacity var(--sm-transition-fast);
}

.paper-item:hover {
  background-color: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.paper-item--active {
  background-color: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
}

.paper-item--disabled {
  cursor: default;
}

.paper-item--disabled:hover {
  background-color: transparent;
  border-color: transparent;
}

.paper-item__icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: 10px;
  color: var(--sm-color-text-secondary);
  flex-shrink: 0;
}

.paper-item__info {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
}

.paper-item__name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--sm-color-text-primary);
  margin-bottom: 3px;
  padding-right: 40px;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.paper-item__meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-bottom: 8px;
}

.paper-item__meta-row:last-child {
  margin-bottom: 0;
}

.paper-item__meta {
  font-size: 12px;
  line-height: 1.4;
  color: var(--sm-color-text-tertiary);
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 5px;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}

.paper-item__meta > span {
  flex-shrink: 0;
}

.paper-item__meta-sep {
  opacity: 0.5;
}

.paper-item__progress-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--sm-color-text-secondary);
  line-height: 1.5;
}

.paper-item__progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
}

.paper-item__progress-label {
  color: var(--sm-color-text-tertiary);
  flex-shrink: 0;
}

.paper-item__progress-track {
  position: relative;
  width: 100%;
  height: var(--sm-paper-progress-height);
  overflow: hidden;
  border-radius: var(--sm-paper-progress-radius);
  background: var(--sm-color-paper-progress-track);
}

.paper-item__progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width var(--sm-transition-medium);
}

.paper-item__progress-fill--render {
  background: var(--sm-color-paper-progress-render);
}

.paper-item__progress-fill--ocr {
  background: var(--sm-color-paper-progress-ocr);
}

.paper-item__retry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-top: 6px;
  padding: 10px;
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: 10px;
  background: var(--sm-color-surface-2);
}

.paper-item__retry-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--sm-color-status-warning);
}

.paper-item__retry-message {
  font-size: 11px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.paper-item__retry-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sm-color-paper-progress-retry) 14%, transparent);
  color: var(--sm-color-paper-progress-retry);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.paper-item__retry-btn:hover {
  border-color: color-mix(in srgb, var(--sm-color-paper-progress-retry) 28%, transparent);
  background: color-mix(in srgb, var(--sm-color-paper-progress-retry) 18%, transparent);
}

.paper-item__unreadable {
  margin-top: 6px;
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
}

.paper-item__actions {
  position: absolute;
  top: 10px;
  right: 12px;
  display: flex;
  align-items: flex-end;
  z-index: 1;
}

.paper-item__delete-btn {
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
}

.paper-item:hover .paper-item__delete-btn,
.paper-item--disabled .paper-item__delete-btn,
.paper-item:hover .paper-item__translation-tag,
.paper-item--disabled .paper-item__translation-tag {
  opacity: 1;
}

.paper-item__delete-btn:hover {
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: rgba(199, 120, 120, 0.92);
}

.paper-item__translation-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-height: 22px;
  min-width: 56px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--sm-color-success, #23a26d) 24%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--sm-color-success, #23a26d) 10%, transparent);
  color: var(--sm-color-success, #23a26d);
  font-size: 11px;
  line-height: 20px;
  text-align: center;
  cursor: pointer;
  opacity: 0.92;
  transition:
    opacity var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.paper-item__translation-tag-delete {
  display: none;
}

.paper-item__translation-tag:hover {
  border-color: color-mix(in srgb, var(--sm-color-danger, #ef4444) 34%, transparent);
  background: color-mix(in srgb, var(--sm-color-danger, #ef4444) 12%, transparent);
  color: var(--sm-color-danger, #ef4444);
}

.paper-item__translation-tag:hover .paper-item__translation-tag-default {
  display: none;
}

.paper-item__translation-tag:hover .paper-item__translation-tag-delete {
  display: inline;
}
</style>
