<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperChatQuoteStore } from '@renderer/stores/paperChatQuoteStore'
import { useNotification } from '@renderer/composables/useNotification'
import type { PaperQuote } from '@shared/types/chat'
import PaperMarkdownView from '@renderer/components/paper/PaperMarkdownView.vue'
import PaperOriginalPdfView from '@renderer/components/paper/PaperOriginalPdfView.vue'
import PaperFigurePreview from '@renderer/components/paper/PaperFigurePreview.vue'
import PaperChatPanel from '@renderer/components/paper/chat/PaperChatPanel.vue'

const store = usePaperReaderStore()
const uiStateStore = useUIStateStore()
const paperChatQuoteStore = usePaperChatQuoteStore()
const notify = useNotification()

const {
  currentPaperId,
  currentPaper,
  markdownContent,
  markdownLoading,
  isOcrCompleted,
  paperBasePath,
  currentAnnotations,
  currentReaderDocument,
  originalPdfVisible,
  translationVisible,
  currentTranslationCache
} = storeToRefs(store)
const { paperChatPanelOpen, paperChatPanelWidth } = storeToRefs(uiStateStore)
const isResizingPaperChat = ref(false)
const markdownViewRef = ref<InstanceType<typeof PaperMarkdownView> | null>(null)
const isPaperChatPanelVisible = computed(
  () => paperChatPanelOpen.value && Boolean(currentPaper.value) && isOcrCompleted.value
)

provide('scrollToQuote', (quote: PaperQuote) => {
  markdownViewRef.value?.scrollToQuoteAndHighlight(quote)
})

async function handleAddToChat(quote: PaperQuote): Promise<void> {
  const paperId = currentPaper.value?.id
  if (!paperId) {
    return
  }

  const sessionResult = await store.ensurePaperChatSession(paperId)
  const sessionId = sessionResult.data
  if (!sessionResult.success || !sessionId) {
    notify.error('论文对话', sessionResult.error || '创建论文对话失败', { source: 'chat' })
    return
  }

  paperChatQuoteStore.addQuote(sessionId, quote)
  uiStateStore.setPaperChatPanelOpen(true)
}

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

  if (!currentPaperId.value && uiStateStore.lastPaperId) {
    store.selectPaper(uiStateStore.lastPaperId)
  }

  if (currentPaperId.value && isOcrCompleted.value) {
    await store.loadMarkdown(currentPaperId.value)
  }
})

watch([currentPaperId, isOcrCompleted], ([paperId, completed]) => {
  if (!paperId || !completed) {
    uiStateStore.setPaperChatPanelOpen(false)
  }
})

watch(markdownLoading, async (loading, wasLoading) => {
  if (loading || !wasLoading) return

  const progress = currentPaper.value?.readingProgress
  if (!progress?.translationVisible) return

  if (!store.translationVisible) {
    await store.toggleTranslationVisible()
  }
})

onBeforeUnmount(() => {
  stopPaperChatResize()
  store.resetFigureUiState()
  store.hideOriginalPdf()
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

      <PaperOriginalPdfView
        v-else-if="isOcrCompleted && originalPdfVisible && currentPaper"
        :paper-id="currentPaperId || ''"
        :page-assets="currentPaper.pageAssets"
        :page-count="currentPaper.pageCount"
      />

      <PaperMarkdownView
        v-else-if="isOcrCompleted"
        ref="markdownViewRef"
        :content="markdownContent"
        :loading="markdownLoading"
        :paper-id="currentPaperId || ''"
        :base-path="paperBasePath || undefined"
        :annotations="currentAnnotations"
        :reader-document="currentReaderDocument"
        :translation-visible="translationVisible"
        :translation-cache="currentTranslationCache"
        :reading-progress="currentPaper?.readingProgress"
        @add-to-chat="handleAddToChat"
      />
    </div>

    <div
      class="paper-reader-page__chat-slot"
      :class="{
        'paper-reader-page__chat-slot--open': isPaperChatPanelVisible,
        'paper-reader-page__chat-slot--resizing': isResizingPaperChat
      }"
      :style="{ '--paper-chat-panel-width': `${paperChatPanelWidth}px` }"
    >
      <Transition name="paper-chat-panel-slide">
        <aside v-if="isPaperChatPanelVisible && currentPaper" class="paper-reader-page__chat">
          <div
            class="paper-reader-page__chat-resize"
            role="separator"
            aria-orientation="vertical"
            title="拖拽调整聊天窗口宽度"
            @pointerdown="startPaperChatResize"
          ></div>
          <PaperChatPanel
            :paper="currentPaper"
            @close="uiStateStore.setPaperChatPanelOpen(false)"
          />
        </aside>
      </Transition>
    </div>

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

.paper-reader-page__chat-slot {
  position: relative;
  flex: 0 0 0;
  width: 0;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: visible;
  transition:
    flex-basis 180ms cubic-bezier(0.2, 0, 0, 1),
    width 180ms cubic-bezier(0.2, 0, 0, 1);
  will-change: flex-basis, width;
}

.paper-reader-page__chat-slot--open {
  flex-basis: var(--paper-chat-panel-width);
  width: var(--paper-chat-panel-width);
}

.paper-reader-page__chat-slot--resizing {
  transition: none;
}

.paper-reader-page__chat {
  position: relative;
  flex: 0 0 auto;
  box-sizing: border-box;
  width: var(--paper-chat-panel-width);
  min-width: 340px;
  max-width: min(680px, 100vw);
  height: calc(100% - var(--sm-paper-toolbar-height) - var(--sm-space-2));
  min-height: 0;
  margin-top: var(--sm-paper-toolbar-height);
  margin-bottom: var(--sm-space-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-bg-canvas);
  overflow: hidden;
}

.paper-chat-panel-slide-enter-active,
.paper-chat-panel-slide-leave-active {
  transition:
    opacity 150ms linear,
    transform 180ms cubic-bezier(0.2, 0, 0, 1);
  will-change: transform, opacity;
}

.paper-chat-panel-slide-enter-from,
.paper-chat-panel-slide-leave-to {
  opacity: 0;
  transform: translateX(calc(var(--sm-motion-distance-md) * 2));
}

.paper-chat-panel-slide-enter-to,
.paper-chat-panel-slide-leave-from {
  opacity: 1;
  transform: translateX(0);
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
  .paper-reader-page__chat-slot {
    position: absolute;
    top: var(--sm-paper-toolbar-height);
    right: 0;
    bottom: var(--sm-space-2);
    z-index: 20;
    flex-basis: 0;
    width: min(100vw, 420px);
    height: auto;
    pointer-events: none;
    transition: none;
  }

  .paper-reader-page__chat-slot--open {
    flex-basis: 0;
    width: min(100vw, 420px);
  }

  .paper-reader-page__chat {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(100vw, 420px) !important;
    height: auto;
    margin: 0;
    min-width: min(100vw, 340px);
    pointer-events: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .paper-reader-page__chat-slot,
  .paper-chat-panel-slide-enter-active,
  .paper-chat-panel-slide-leave-active {
    transition: none;
  }
}
</style>
