<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperChatQuoteStore } from '@renderer/stores/paperChatQuoteStore'
import { useNotification } from '@renderer/composables/useNotification'
import type { PaperQuote } from '@shared/types/chat'
import styles from './PaperReaderPage.module.css'
import PaperMarkdownView from '@renderer/components/paper/PaperMarkdownView.vue'
import PaperOriginalPdfView from '@renderer/components/paper/PaperOriginalPdfView.vue'
import PaperFigurePreview from '@renderer/components/paper/PaperFigurePreview.vue'
import PaperChatPanel from '@renderer/components/paper/chat/PaperChatPanel.vue'

const store = usePaperReaderStore()
const uiStateStore = useZustandStore(useUIStateStore)
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
const isResizingPaperChat = ref(false)
const markdownViewRef = ref<InstanceType<typeof PaperMarkdownView> | null>(null)
const isPaperChatPanelVisible = computed(
  () => uiStateStore.paperChatPanelOpen && Boolean(currentPaper.value) && isOcrCompleted.value
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
  <div :class="[styles.page, 'sm-workspace-view']">
    <div :class="[styles.main, { [styles.mainReader]: isOcrCompleted }]">
      <div v-if="!currentPaperId" :class="styles.emptyState">
        <div :class="['sm-empty', styles.emptyCard]">
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
      :class="[
        styles.chatSlot,
        {
          [styles.chatSlotOpen]: isPaperChatPanelVisible,
          [styles.chatSlotResizing]: isResizingPaperChat
        }
      ]"
      :style="{ '--paper-chat-panel-width': `${uiStateStore.paperChatPanelWidth}px` }"
    >
      <Transition name="paper-chat-panel-slide">
        <aside v-if="isPaperChatPanelVisible && currentPaper" :class="styles.chat">
          <div
            :class="styles.chatResize"
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
