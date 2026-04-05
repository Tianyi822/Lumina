<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'

// 子组件
import PaperEmptyState from '@renderer/components/paper/PaperEmptyState.vue'
import PaperProgressPanel from '@renderer/components/paper/PaperProgressPanel.vue'
import PaperMarkdownView from '@renderer/components/paper/PaperMarkdownView.vue'
import PaperStatusCard from '@renderer/components/paper/PaperStatusCard.vue'

const store = usePaperReaderStore()

// ==================== Store 状态解构 ====================

const {
  currentPaper,
  currentPaperId,
  ocrProgress,
  markdownContent,
  markdownLoading,
  renderingProgress,
  isOcrCompleted,
  isOcrProcessing,
  paperBasePath
} = storeToRefs(store)

// ==================== 计算属性：当前展示阶段 ====================

/** 当前面板应显示的阶段 */
const panelStage = computed(() => {
  const paper = currentPaper.value
  if (!paper) return 'idle' as const
  if (ocrProgress.value) {
    // OCR 进度优先使用 progress 的 status
    const stageMap: Record<
      string,
      'idle' | 'rendering' | 'ocr_processing' | 'completed' | 'failed' | 'cancelled'
    > = {
      idle: 'idle',
      processing: 'ocr_processing',
      completed: 'completed',
      partial_failed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled'
    }
    return stageMap[ocrProgress.value.status] || 'idle'
  }
  // 无 OCR 进度时，根据论文状态判断
  switch (paper.status) {
    case 'draft':
      return 'idle' as const
    case 'rendering':
      return 'rendering' as const
    case 'ocr_processing':
      return 'ocr_processing' as const
    case 'completed':
    case 'partial_failed':
      return 'completed' as const
    case 'failed':
      return 'failed' as const
    default:
      return 'idle' as const
  }
})

/** 是否正在处理中（渲染或 OCR） */
const isProcessing = computed(
  () =>
    renderingProgress.value.stage === 'rendering' ||
    renderingProgress.value.stage === 'selecting' ||
    renderingProgress.value.stage === 'loading' ||
    isOcrProcessing.value
)

// ==================== 生命周期 ====================

onMounted(async () => {
  await store.loadPapers()

  // 如果已有选中论文且已完成 OCR，自动加载 Markdown
  if (currentPaperId.value && isOcrCompleted.value) {
    await store.loadMarkdown(currentPaperId.value)
  }
})

onBeforeUnmount(() => {
  store.cleanupOcrListener()
})

// ==================== 事件处理（中转到 Store Actions）====================

async function handleUpload(): Promise<void> {
  await store.uploadAndRenderPdf()
}

function handleStartOcr(): void {
  if (currentPaperId.value) {
    store.startOcrWithProgress(currentPaperId.value)
  }
}

function handleCancel(): void {
  if (currentPaperId.value) {
    if (isOcrProcessing.value) {
      store.cancelOcr(currentPaperId.value)
    }
    store.cancelRendering()
  }
}

function handleRetryPage(pageIndex: number): void {
  if (currentPaperId.value) {
    store.retryFailedPage(currentPaperId.value, pageIndex)
  }
}

function handleStartReading(): void {
  // 已完成状态，Markdown 应已自动加载，无需额外操作
}
</script>

<template>
  <div class="paper-reader-page sm-workspace-view">
    <div
      class="paper-reader-page__main"
      :class="{ 'paper-reader-page__main--reader': isOcrCompleted }"
    >
      <!-- 无选中论文 → 空状态引导 -->
      <PaperEmptyState v-if="!currentPaper" @upload="handleUpload" />

      <!-- 处理中 → 进度面板 -->
      <PaperProgressPanel
        v-else-if="isProcessing"
        :progress="ocrProgress"
        :paper="currentPaper"
        :stage="panelStage"
        :rendering-progress="{
          currentPage: renderingProgress.currentPage,
          totalPages: renderingProgress.totalPages,
          completedPages: renderingProgress.completedPages,
          error: renderingProgress.error
        }"
        @cancel="handleCancel"
        @retry-page="handleRetryPage"
        @start-ocr="handleStartOcr"
        @start-reading="handleStartReading"
      />

      <!-- 已完成 OCR → Markdown 阅读视图 -->
      <PaperMarkdownView
        v-else-if="isOcrCompleted"
        :content="markdownContent"
        :loading="markdownLoading"
        :paper-id="currentPaperId || ''"
        :base-path="paperBasePath || undefined"
      />

      <!-- 其他非完成状态（draft/failed）→ 状态卡片 -->
      <PaperStatusCard
        v-else
        :paper="currentPaper"
        @start-ocr="handleStartOcr"
        @retry="handleStartOcr"
        @upload-pdf="handleUpload"
      />
    </div>
  </div>
</template>

<style scoped>
.paper-reader-page {
  position: relative;
}

.paper-reader-page__main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow: auto;
  padding: var(--sm-space-5);
}

.paper-reader-page__main--reader {
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;
  padding: 0;
}
</style>
