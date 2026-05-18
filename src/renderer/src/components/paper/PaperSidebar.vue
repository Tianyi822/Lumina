<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { formatFileSize } from '@shared/utils'
import type { OcrProgressInfo, PaperDocument, PaperStatus } from '@shared/types/paper'
import type { RenderingProgress } from '@renderer/stores/paperReaderStore'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import styles from './PaperSidebar.module.css'

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
    <div :class="styles['paper-list']">
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
          <div :class="styles['paper-item__icon']">
            <SvgIcon name="file-pdf" :size="20" />
          </div>

          <div :class="styles['paper-item__info']">
            <div :class="styles['paper-item__name']" :title="paper.fileName">
              {{ paper.fileName }}
            </div>
            <div :class="styles['paper-item__meta-row']">
              <div :class="styles['paper-item__meta']">
                <span>{{ paper.pageCount }} 页</span>
                <span :class="styles['paper-item__meta-sep']">·</span>
                <span>{{ formatFileSize(paper.fileSize) }}</span>
              </div>

              <button
                v-if="hasTranslated(paper.id)"
                :class="styles['paper-item__translation-tag']"
                type="button"
                title="点击删除翻译内容"
                @click="handleDeleteTranslation(paper.id, $event)"
              >
                <span :class="styles['paper-item__translation-tag-default']">有译文</span>
                <span :class="styles['paper-item__translation-tag-delete']">删除翻译</span>
              </button>
            </div>

            <div v-if="shouldShowRenderProgress(paper)" :class="styles['paper-item__progress']">
              <div :class="styles['paper-item__progress-line']">
                <span :class="styles['paper-item__progress-label']">截图进度</span>
                <span>{{ formatRenderProgressText(paper) }}</span>
              </div>
              <div :class="styles['paper-item__progress-track']">
                <span
                  :class="[
                    styles['paper-item__progress-fill'],
                    styles['paper-item__progress-fill--render']
                  ]"
                  :style="{ width: `${getRenderProgressPercent(paper)}%` }"
                />
              </div>
            </div>

            <div v-else-if="shouldShowOcrProgress(paper)" :class="styles['paper-item__progress']">
              <div :class="styles['paper-item__progress-line']">
                <span :class="styles['paper-item__progress-label']">OCR 进度</span>
                <span>{{ formatOcrProgressText(paper) }}</span>
              </div>
              <div :class="styles['paper-item__progress-track']">
                <span
                  :class="[
                    styles['paper-item__progress-fill'],
                    styles['paper-item__progress-fill--ocr']
                  ]"
                  :style="{ width: `${getOcrProgressPercent(paper)}%` }"
                />
              </div>
            </div>

            <div v-if="shouldShowRetry(paper)" :class="styles['paper-item__retry']">
              <div :class="styles['paper-item__retry-title']">{{ getRetryTitle(paper) }}</div>
              <div :class="styles['paper-item__retry-message']">{{ getRetryMessage(paper) }}</div>
              <button
                :class="styles['paper-item__retry-btn']"
                type="button"
                @click="handleRetryPaper(paper.id, $event)"
              >
                重试
              </button>
            </div>

            <div v-if="!isPaperReadable(paper)" :class="styles['paper-item__unreadable']">
              {{ getUnreadableText(paper) }}
            </div>
          </div>

          <div :class="styles['paper-item__actions']">
            <button
              :class="styles['paper-item__delete-btn']"
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
