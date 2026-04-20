<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type {
  PaperAnnotation,
  PaperReaderDocument,
  PaperTranslationCache
} from '@shared/types/paper'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import {
  usePaperMarkdownEngine,
  getTranslationRenderKey
} from './composables/usePaperMarkdownEngine'
import { usePaperAnnotationComposer } from './composables/usePaperAnnotationComposer'
import { usePaperQuoteHighlight } from './composables/usePaperQuoteHighlight'
import PaperAnnotationHoverPopover from './annotation/PaperAnnotationHoverPopover.vue'
import PaperAnnotationNoteEditor from './annotation/PaperAnnotationNoteEditor.vue'
import PaperAnnotationSelectionMenu from './annotation/PaperAnnotationSelectionMenu.vue'
import PaperMarkdownSegmentList from './PaperMarkdownSegmentList.vue'
import PaperMarkdownStatusPanels from './PaperMarkdownStatusPanels.vue'
import PaperMarkdownAnnotationManager from './PaperMarkdownAnnotationManager.vue'

const props = defineProps<{
  content: string
  loading: boolean
  paperId: string
  basePath?: string
  translationVisible: boolean
  translationCache?: PaperTranslationCache | null
  readerDocument?: PaperReaderDocument | null
  annotations?: PaperAnnotation[]
}>()

const emit = defineEmits<{
  (e: 'add-to-chat', quote: import('@shared/types/chat').PaperQuote): void
}>()

const quoteHighlight = usePaperQuoteHighlight()

defineExpose({ scrollToQuoteAndHighlight: quoteHighlight.scrollToQuoteAndHighlight })

const paperReaderStore = usePaperReaderStore()
const { zoomLevel } = storeToRefs(paperReaderStore)

const contentZoomStyle = computed(() => ({
  zoom: zoomLevel.value
}))

const engine = usePaperMarkdownEngine({
  content: () => props.content,
  basePath: () => props.basePath,
  translationVisible: () => props.translationVisible,
  translationCache: () => props.translationCache,
  readerDocument: () => props.readerDocument,
  annotations: () => props.annotations,
  setTocOutline: paperReaderStore.setPaperTocOutline,
  clearToc: paperReaderStore.clearPaperToc
})

const composer = usePaperAnnotationComposer({
  paperId: () => props.paperId,
  translationCache: () => props.translationCache,
  annotations: () => props.annotations,
  renderedSegments: engine.renderedSegments,
  getSourceSegments: engine.getSourceSegments,
  createAnnotation: paperReaderStore.createAnnotation,
  reanchorAnnotation: paperReaderStore.reanchorAnnotation,
  updateAnnotation: paperReaderStore.updateAnnotation,
  deleteAnnotation: paperReaderStore.deleteAnnotation,
  onAddToChat: (quote) => emit('add-to-chat', quote)
})

const annotationManagerActions = computed(() => ({
  orphanAnnotations: composer.orphanAnnotations.value,
  rebindAnnotationId: composer.rebindAnnotationId.value,
  getAnnotationTypeLabel: composer.getAnnotationTypeLabel,
  getAnnotationStatusLabel: composer.getAnnotationStatusLabel,
  startRebind: composer.startRebind,
  scrollToSegment: composer.scrollToSegment,
  handleDeleteAnnotation: composer.handleDeleteAnnotation,
  handleCancelComposer: composer.handleCancelComposer
}))

watch(
  () => [
    props.content,
    props.basePath,
    props.translationVisible,
    getTranslationRenderKey(props.translationCache),
    props.readerDocument?.sourceRevisionId,
    composer.currentAnnotations.value.length,
    composer.currentAnnotations.value.map((annotation) => annotation.updatedAt).join('|')
  ],
  (newValues, oldValues) => {
    void engine.renderContent()

    if (!oldValues) {
      composer.clearComposer()
      composer.cancelRebindMode()
      return
    }

    const contentChanged = newValues[0] !== oldValues[0]
    const basePathChanged = newValues[1] !== oldValues[1]
    const translationVisibleChanged = newValues[2] !== oldValues[2]
    const sourceRevisionIdChanged = newValues[4] !== oldValues[4]

    if (contentChanged || basePathChanged || translationVisibleChanged || sourceRevisionIdChanged) {
      composer.clearComposer()
      composer.cancelRebindMode()
    }
  },
  { immediate: true }
)

const hasContent = computed(() => !!props.content.trim())

function handleHoverPopoverDelete(): void {
  const annotation = composer.hoverPopoverAnnotation.value
  if (!annotation) {
    return
  }

  void composer.handleDeleteAnnotation(annotation.id)
}

function handleHoverPopoverOpenNoteEditor(): void {
  composer.handleOpenNoteEditorFromHover()
}

if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', composer.handleDocumentPointerDown)
  document.addEventListener('keydown', composer.handleDocumentKeyDown)
}

onBeforeUnmount(() => {
  paperReaderStore.clearPaperToc()
  if (typeof document !== 'undefined') {
    document.removeEventListener('mousedown', composer.handleDocumentPointerDown)
    document.removeEventListener('keydown', composer.handleDocumentKeyDown)
  }
})
</script>

<template>
  <div class="paper-markdown-view">
    <div
      class="paper-markdown-view__scroll"
      @mouseup="composer.updateComposerFromSelection"
      @click="composer.handleSurfaceAnnotationClick"
      @wheel="paperReaderStore.handleWheelZoom"
    >
      <div v-if="loading" class="paper-markdown-view__loading">
        <p>正在加载内容...</p>
      </div>

      <div v-else-if="engine.parseError.value" class="paper-markdown-view__error">
        <p>{{ engine.parseError.value }}</p>
      </div>

      <div v-else-if="!hasContent" class="paper-markdown-view__empty">
        <p>暂无内容</p>
      </div>

      <article v-else class="paper-markdown-view__content" :style="contentZoomStyle">
        <PaperMarkdownStatusPanels
          :translation-missing-count="composer.translationMissingAnnotations.value.length"
          :outdated-count="composer.outdatedAnnotations.value.length"
          :on-retranslate="paperReaderStore.toggleTranslationVisible"
          :on-view-in-original="paperReaderStore.hideTranslation"
        />

        <PaperMarkdownAnnotationManager :actions="annotationManagerActions" />

        <PaperMarkdownSegmentList :segments="engine.renderedSegments.value" />
      </article>
    </div>

    <PaperAnnotationSelectionMenu
      v-if="composer.selectionActionMenu.value"
      :state="composer.selectionActionMenu.value"
      :highlight-color-options="composer.highlightColorOptions"
      :error="composer.selectionActionMenuError.value"
      @create-highlight="composer.handleCreateHighlight"
      @open-note-editor="composer.handleOpenNoteEditorFromSelection"
      @add-to-chat="composer.handleAddToChat"
      @cancel="composer.handleCancelComposer"
    />

    <PaperAnnotationNoteEditor
      v-if="composer.noteEditorDraft.value"
      :state="composer.noteEditorDraft.value"
      :comment="composer.noteEditorComment.value"
      :saving="composer.noteEditorSaving.value"
      :error="composer.noteEditorError.value"
      @update:comment="composer.noteEditorComment.value = $event"
      @save="composer.handleSaveNote"
      @cancel="composer.handleCancelNoteEditor"
    />

    <PaperAnnotationHoverPopover
      v-if="composer.annotationHoverPopover.value && composer.hoverPopoverAnnotation.value"
      :state="composer.annotationHoverPopover.value"
      :annotation="composer.hoverPopoverAnnotation.value"
      :highlight-color-options="composer.highlightColorOptions"
      :error="composer.hoverPopoverError.value"
      @delete="handleHoverPopoverDelete"
      @open-note-editor="handleHoverPopoverOpenNoteEditor"
      @update-color="composer.handleUpdateHoverColor"
    />
  </div>
</template>

<style scoped>
.paper-markdown-view {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.paper-markdown-view__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--sm-color-border-strong) transparent;
  scrollbar-gutter: stable;
  padding: var(--sm-space-3) var(--sm-space-4) var(--sm-space-6);
}

.paper-markdown-view__scroll::-webkit-scrollbar {
  width: 10px;
}

.paper-markdown-view__scroll::-webkit-scrollbar-track {
  background: transparent;
}

.paper-markdown-view__scroll::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 999px;
  background: var(--sm-color-border-strong);
  background-clip: content-box;
}

.paper-markdown-view__scroll::-webkit-scrollbar-thumb:hover {
  background: var(--sm-color-text-tertiary);
  background-clip: content-box;
}

.paper-markdown-view__loading,
.paper-markdown-view__error,
.paper-markdown-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  font-size: 14px;
  color: var(--sm-color-text-tertiary);
}

.paper-markdown-view__error {
  color: var(--sm-color-status-danger);
}

.paper-markdown-view__content {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

:deep(mark.paper-markdown-view__quote-highlight) {
  background: color-mix(in srgb, var(--sm-color-accent) 22%, transparent);
  border-radius: 3px;
  color: inherit;
  animation: quote-highlight-fade 1.8s ease-out forwards;
}

:deep(mark.paper-markdown-view__quote-highlight *) {
  color: inherit;
}

@keyframes quote-highlight-fade {
  0% {
    background: color-mix(in srgb, var(--sm-color-accent) 30%, transparent);
  }
  70% {
    background: color-mix(in srgb, var(--sm-color-accent) 12%, transparent);
  }
  100% {
    background: transparent;
  }
}
</style>
