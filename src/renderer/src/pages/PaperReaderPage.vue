<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import PaperMarkdownView from '@renderer/components/paper/PaperMarkdownView.vue'
import PaperFigurePreview from '@renderer/components/paper/PaperFigurePreview.vue'
import PaperChatPanel from '@renderer/components/paper/chat/PaperChatPanel.vue'

const store = usePaperReaderStore()
const uiStateStore = useUIStateStore()

const {
  currentPaperId,
  currentPaper,
  markdownContent,
  markdownLoading,
  isOcrCompleted,
  paperBasePath,
  currentAnnotations,
  currentReaderDocument,
  translationVisible,
  currentTranslationCache
} = storeToRefs(store)
const { paperChatPanelOpen, paperChatPanelWidth } = storeToRefs(uiStateStore)
const isResizingPaperChat = ref(false)

function handlePaperChatResizeMove(event: PointerEvent): void {
  if (!isResizingPaperChat.value) {
    return
  }

  uiStateStore.setPaperChatPanelWidth(window.innerWidth - event.clientX)
}

function stopPaperChatResize(): void {
  if (!isResizingPaperChat.value) {
    return
  }

  isResizingPaperChat.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  window.removeEventListener('pointermove', handlePaperChatResizeMove)
  window.removeEventListener('pointerup', stopPaperChatResize)
}

function startPaperChatResize(event: PointerEvent): void {
  event.preventDefault()
  isResizingPaperChat.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', handlePaperChatResizeMove)
  window.addEventListener('pointerup', stopPaperChatResize)
  handlePaperChatResizeMove(event)
}

onMounted(async () => {
  store.ensureOcrProgressListener()
  await store.loadPapers()

  if (currentPaperId.value && isOcrCompleted.value) {
    await store.loadMarkdown(currentPaperId.value)
  }
})

watch([currentPaperId, isOcrCompleted], ([paperId, completed]) => {
  if (!paperId || !completed) {
    uiStateStore.setPaperChatPanelOpen(false)
  }
})

onBeforeUnmount(() => {
  stopPaperChatResize()
  store.resetFigureUiState()
})
</script>

<template>
  <div class="paper-reader-page sm-workspace-view">
    <div
      class="paper-reader-page__main"
      :class="{ 'paper-reader-page__main--reader': isOcrCompleted }"
    >
      <div v-if="!currentPaperId" class="paper-reader-page__empty-state">
        <div class="sm-empty paper-reader-page__empty-card">
          <h2>选择一篇论文开始阅读</h2>
          <p>从左侧列表中选择已有文献，或直接上传 PDF 开始阅读。</p>
          <button
            class="sm-button sm-button--primary"
            type="button"
            @click="store.uploadAndRenderPdf()"
          >
            上传 PDF
          </button>
        </div>
      </div>

      <PaperMarkdownView
        v-else-if="isOcrCompleted"
        :content="markdownContent"
        :loading="markdownLoading"
        :paper-id="currentPaperId || ''"
        :base-path="paperBasePath || undefined"
        :annotations="currentAnnotations"
        :reader-document="currentReaderDocument"
        :translation-visible="translationVisible"
        :translation-cache="currentTranslationCache"
      />
    </div>

    <aside
      v-if="paperChatPanelOpen && currentPaper && isOcrCompleted"
      class="paper-reader-page__chat"
      :style="{ width: `${paperChatPanelWidth}px` }"
    >
      <div
        class="paper-reader-page__chat-resize"
        role="separator"
        aria-orientation="vertical"
        title="拖拽调整聊天窗口宽度"
        @pointerdown="startPaperChatResize"
      ></div>
      <PaperChatPanel :paper="currentPaper" @close="uiStateStore.setPaperChatPanelOpen(false)" />
    </aside>

    <PaperFigurePreview />
  </div>
</template>

<style scoped>
.paper-reader-page {
  position: relative;
  flex-direction: row;
  background: var(--sm-color-bg-canvas);
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

.paper-reader-page__empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sm-space-6);
}

.paper-reader-page__empty-card {
  width: min(520px, 100%);
  background: var(--sm-color-surface-2);
  border-style: solid;
}

.paper-reader-page__empty-card h2 {
  margin: 0;
  font-size: 18px;
  color: var(--sm-color-text-primary);
}

.paper-reader-page__empty-card p {
  margin: 0;
  max-width: 420px;
  line-height: 1.6;
}

.paper-reader-page__chat {
  position: relative;
  flex: 0 0 auto;
  box-sizing: border-box;
  min-width: 340px;
  max-width: min(680px, 100vw);
  height: calc(100% - 44px - var(--sm-space-2));
  min-height: 0;
  margin-top: 44px;
  margin-bottom: var(--sm-space-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-bg-canvas);
  overflow: hidden;
}

.paper-reader-page__chat-resize {
  position: absolute;
  top: 0;
  left: -4px;
  z-index: 3;
  width: 8px;
  height: 100%;
  cursor: col-resize;
}

.paper-reader-page__chat-resize::after {
  content: '';
  position: absolute;
  top: 0;
  left: 3px;
  width: 1px;
  height: 100%;
  background: transparent;
  transition: background-color var(--sm-transition-fast);
}

.paper-reader-page__chat-resize:hover::after {
  background: var(--sm-color-border-selected);
}

@media (max-width: 760px) {
  .paper-reader-page__chat {
    position: absolute;
    top: 44px;
    right: 0;
    bottom: var(--sm-space-2);
    z-index: 20;
    width: min(100vw, 420px) !important;
    height: auto;
    margin: 0;
    min-width: min(100vw, 340px);
  }
}
</style>
