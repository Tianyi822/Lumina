<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { PaperQuote } from '@shared/types/chat'
import type {
  PaperAnnotation,
  PaperReadingProgress,
  PaperReaderDocument,
  PaperTranslationCache
} from '@shared/types/paper'
import { useNotification } from '@renderer/composables/useNotification'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import {
  usePaperMarkdownEngine,
  getTranslationRenderKey
} from './composables/usePaperMarkdownEngine'
import { usePaperAnnotationComposer } from './composables/usePaperAnnotationComposer'
import { usePaperQuoteHighlight } from './composables/usePaperQuoteHighlight'
import { usePaperReadingProgress } from './composables/usePaperReadingProgress'
import { usePaperTextSearch } from './composables/usePaperTextSearch'
import { useZoomAnchor } from './composables/useZoomAnchor'
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
  readingProgress?: PaperReadingProgress | null
}>()

const emit = defineEmits<{
  (e: 'add-to-chat', quote: import('@shared/types/chat').PaperQuote): void
}>()

const quoteHighlight = usePaperQuoteHighlight()

defineExpose({ scrollToQuoteAndHighlight: quoteHighlight.scrollToQuoteAndHighlight })

const scrollContainerRef = ref<HTMLElement | null>(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const paperReaderStore = usePaperReaderStore()
const notify = useNotification()
const { markdownZoomLevel } = storeToRefs(paperReaderStore)
const textSearch = usePaperTextSearch()

const contentZoomStyle = computed(() => ({
  zoom: markdownZoomLevel.value
}))

interface TableDragState {
  wrap: HTMLElement
  pointerId: number
  startClientX: number
  startScrollLeft: number
  hasDragged: boolean
}

const TABLE_DRAG_THRESHOLD = 4
let tableDragState: TableDragState | null = null
let lastTableDragEndedAt = 0

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

usePaperReadingProgress({
  scrollContainer: scrollContainerRef,
  paperId: () => props.paperId,
  renderedSegments: engine.renderedSegments,
  loading: () => props.loading,
  sourceRevisionId: () => props.readerDocument?.sourceRevisionId,
  readingProgress: () => props.readingProgress,
  translationVisible: () => props.translationVisible
})

const zoomAnchor = useZoomAnchor({
  containerRef: scrollContainerRef,
  zoomLevelRef: markdownZoomLevel
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
  outdatedAnnotations: composer.outdatedAnnotations.value,
  rebindAnnotationId: composer.rebindAnnotationId.value,
  outdatedUpdating: composer.outdatedAnnotationUpdating.value,
  outdatedError: composer.outdatedAnnotationError.value,
  getAnnotationTypeLabel: composer.getAnnotationTypeLabel,
  getAnnotationStatusLabel: composer.getAnnotationStatusLabel,
  startRebind: composer.startRebind,
  resolveAnnotationForCurrentTranslation: handleResolveAnnotationForCurrentTranslation,
  handleDeleteAnnotation: composer.handleDeleteAnnotation,
  handleCancelComposer: composer.handleCancelComposer
}))

function isTableWrapHorizontallyScrollable(wrap: HTMLElement): boolean {
  return wrap.scrollWidth > wrap.clientWidth + 1
}

function syncScrollableTableWrapState(): void {
  scrollContainerRef.value
    ?.querySelectorAll<HTMLElement>('.paper-markdown-view__table-wrap')
    .forEach((wrap) => {
      wrap.classList.toggle(
        'paper-markdown-view__table-wrap--scrollable',
        isTableWrapHorizontallyScrollable(wrap)
      )
    })
}

function cleanupTableDragListeners(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.removeEventListener('pointermove', handleTablePointerMove)
  window.removeEventListener('pointerup', handleTablePointerUp)
  window.removeEventListener('pointercancel', handleTablePointerUp)
}

function clearTableDragState(): void {
  tableDragState?.wrap.classList.remove('paper-markdown-view__table-wrap--dragging')
  tableDragState = null
  cleanupTableDragListeners()
}

function shouldIgnoreTableDragTarget(target: Element): boolean {
  return !!target.closest(
    [
      'a',
      'button',
      'input',
      'textarea',
      'select',
      'mark.paper-annotation-highlight',
      '.paper-markdown-view__retranslate-btn'
    ].join(', ')
  )
}

function handleTablePointerDown(event: PointerEvent): void {
  if (event.button !== 0 || typeof window === 'undefined') {
    return
  }

  const target = event.target
  if (!(target instanceof Element) || shouldIgnoreTableDragTarget(target)) {
    return
  }

  const wrap = target.closest<HTMLElement>('.paper-markdown-view__table-wrap')
  if (!wrap || !isTableWrapHorizontallyScrollable(wrap)) {
    return
  }

  clearTableDragState()
  tableDragState = {
    wrap,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startScrollLeft: wrap.scrollLeft,
    hasDragged: false
  }

  window.addEventListener('pointermove', handleTablePointerMove, { passive: false })
  window.addEventListener('pointerup', handleTablePointerUp)
  window.addEventListener('pointercancel', handleTablePointerUp)
}

function handleTablePointerMove(event: PointerEvent): void {
  if (!tableDragState || event.pointerId !== tableDragState.pointerId) {
    return
  }

  const deltaX = event.clientX - tableDragState.startClientX
  if (!tableDragState.hasDragged && Math.abs(deltaX) < TABLE_DRAG_THRESHOLD) {
    return
  }

  if (!tableDragState.hasDragged) {
    tableDragState.hasDragged = true
    tableDragState.wrap.classList.add('paper-markdown-view__table-wrap--dragging')
    window.getSelection()?.removeAllRanges()
  }

  event.preventDefault()
  tableDragState.wrap.scrollLeft = tableDragState.startScrollLeft - deltaX
}

function handleTablePointerUp(event: PointerEvent): void {
  if (!tableDragState || event.pointerId !== tableDragState.pointerId) {
    return
  }

  if (tableDragState.hasDragged) {
    lastTableDragEndedAt = Date.now()
  }

  clearTableDragState()
}

function renderContentAndSyncTables(): Promise<void> {
  return engine.renderContent().then(async () => {
    await nextTick()
    syncScrollableTableWrapState()
  })
}

type AnnotationMarkViewKind = 'original' | 'translation'

function findAnnotationMark(
  annotationId: string,
  viewKind?: AnnotationMarkViewKind
): HTMLElement | null {
  const surfaceSelector = viewKind
    ? `[data-paper-selection-surface="true"][data-view-kind="${viewKind}"]`
    : '[data-paper-selection-surface="true"]'
  const marks = scrollContainerRef.value?.querySelectorAll<HTMLElement>(
    `${surfaceSelector} mark.paper-annotation-highlight`
  )
  if (!marks) {
    return null
  }

  return Array.from(marks).find((mark) => mark.dataset.annotationId === annotationId) || null
}

function scrollToAndPulseAnnotation(
  annotationId: string,
  viewKind?: AnnotationMarkViewKind
): boolean {
  const mark = findAnnotationMark(annotationId, viewKind)
  if (!mark) {
    return false
  }

  const scrollContainer = scrollContainerRef.value
  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect()
    const markRect = mark.getBoundingClientRect()
    const markTopInContent = markRect.top - containerRect.top + scrollContainer.scrollTop
    const targetScrollTop = markTopInContent - containerRect.height / 2 + markRect.height / 2
    scrollContainer.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    })
  } else {
    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  mark.classList.remove('paper-annotation-highlight--locating')
  void mark.offsetWidth
  mark.classList.add('paper-annotation-highlight--locating')

  window.setTimeout(() => {
    mark.classList.remove('paper-annotation-highlight--locating')
  }, 8000)

  return true
}

async function highlightUpdatedTranslationAnnotation(annotationIds: string[]): Promise<void> {
  await nextTick()
  requestAnimationFrame(() => {
    const targetAnnotationId = annotationIds.find((annotationId) =>
      findAnnotationMark(annotationId, 'translation')
    )
    if (targetAnnotationId) {
      scrollToAndPulseAnnotation(targetAnnotationId, 'translation')
    }
  })
}

function getFirstTranslationMissingAnnotation(): PaperAnnotation | null {
  const sourceOrderMap = new Map(
    engine.getSourceSegments().map((segment, index) => [segment.stableId, index])
  )

  return (
    [...composer.translationMissingAnnotations.value].sort((left, right) => {
      const leftOrder = sourceOrderMap.get(left.semanticAnchor.segmentStableId) ?? Number.MAX_VALUE
      const rightOrder =
        sourceOrderMap.get(right.semanticAnchor.segmentStableId) ?? Number.MAX_VALUE
      return leftOrder - rightOrder || left.createdAt.localeCompare(right.createdAt)
    })[0] || null
  )
}

async function handleViewTranslationMissingInOriginal(): Promise<void> {
  const targetAnnotation = getFirstTranslationMissingAnnotation()
  paperReaderStore.hideTranslation()

  if (!targetAnnotation) {
    return
  }

  await nextTick()
  await renderContentAndSyncTables()

  requestAnimationFrame(() => {
    if (
      targetAnnotation.originalAnchor &&
      scrollToAndPulseAnnotation(targetAnnotation.id, 'original')
    ) {
      return
    }

    composer.scrollToSegment(targetAnnotation.semanticAnchor.segmentStableId)
  })
}

function buildAnnotationQuote(annotation: PaperAnnotation): PaperQuote | null {
  const sourceSegment = engine
    .getSourceSegments()
    .find((segment) => segment.stableId === annotation.semanticAnchor.segmentStableId)
  const textAnchor = annotation.originalAnchor
  if (!sourceSegment || !textAnchor) {
    return null
  }

  return {
    id: `annotation-rebind-${annotation.id}-${Date.now()}`,
    paperId: props.paperId,
    segmentStableId: annotation.semanticAnchor.segmentStableId,
    segmentIndex: sourceSegment.index,
    viewKind: 'original',
    selectedText: textAnchor.selectedText,
    sourceType: 'original',
    sourceLocation: {
      segmentStableId: annotation.semanticAnchor.segmentStableId,
      segmentIndex: sourceSegment.index,
      pageIndexes: [...annotation.semanticAnchor.sourceRefs.pageIndexes],
      blockIndexes: [...annotation.semanticAnchor.sourceRefs.blockIndexes],
      startOffset: textAnchor.startOffset,
      endOffset: textAnchor.endOffset
    },
    textAnchor,
    sourceRevisionId: annotation.semanticAnchor.sourceRevisionId,
    segmentTextHash: annotation.semanticAnchor.segmentTextHash
  }
}

async function highlightAnnotationFallback(annotation: PaperAnnotation): Promise<void> {
  await nextTick()
  const quote = buildAnnotationQuote(annotation)
  if (quote) {
    quoteHighlight.scrollToQuoteAndHighlight(quote)
    return
  }

  composer.scrollToSegment(annotation.semanticAnchor.segmentStableId)
}

async function handleUpdateAnnotationToCurrentTranslation(
  annotation: PaperAnnotation
): ReturnType<typeof composer.updateAnnotationToCurrentTranslation> {
  const result = await composer.updateAnnotationToCurrentTranslation(annotation)
  if (result.success) {
    await highlightUpdatedTranslationAnnotation([annotation.id])
  } else {
    await highlightAnnotationFallback(annotation)
  }
  return result
}

async function handleResolveAnnotationForCurrentTranslation(
  annotation: PaperAnnotation
): Promise<void> {
  if (composer.isAnnotationOutdated(annotation)) {
    await handleUpdateAnnotationToCurrentTranslation(annotation)
    return
  }

  composer.startRebind(annotation)
  await highlightAnnotationFallback(annotation)
}

async function handleUpdateOutdatedAnnotationsToCurrentTranslation(): Promise<void> {
  const candidateAnnotationIds = composer.outdatedAnnotations.value.map(
    (annotation) => annotation.id
  )
  const candidateAnnotations = [...composer.outdatedAnnotations.value]
  await composer.updateOutdatedAnnotationsToCurrentTranslation()
  const rebindAnnotation = candidateAnnotations.find(
    (annotation) => annotation.id === composer.rebindAnnotationId.value
  )
  if (rebindAnnotation) {
    await highlightAnnotationFallback(rebindAnnotation)
    return
  }

  await highlightUpdatedTranslationAnnotation(candidateAnnotationIds)
}

function recordMarkdownScrollPosition(): void {
  if (!props.paperId || !scrollContainerRef.value || zoomAnchor.isZooming()) {
    return
  }

  paperReaderStore.setMarkdownScrollPosition(props.paperId, {
    scrollTop: scrollContainerRef.value.scrollTop,
    scrollLeft: scrollContainerRef.value.scrollLeft
  })
}

async function restoreMarkdownScrollPosition(paperId: string): Promise<void> {
  const position = paperReaderStore.getMarkdownScrollPosition(paperId)
  if (!position) {
    return
  }

  await nextTick()
  requestAnimationFrame(() => {
    if (props.paperId !== paperId || !scrollContainerRef.value) {
      return
    }

    scrollContainerRef.value.scrollTop = position.scrollTop
    scrollContainerRef.value.scrollLeft = position.scrollLeft
  })
}

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
  async (newValues, oldValues) => {
    await renderContentAndSyncTables()

    if (!oldValues) {
      composer.clearComposer()
      composer.cancelRebindMode()
      await restoreMarkdownScrollPosition(props.paperId)
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

    if (contentChanged || basePathChanged || sourceRevisionIdChanged) {
      await restoreMarkdownScrollPosition(props.paperId)
    }
  },
  { immediate: true }
)

const hasContent = computed(() => !!props.content.trim())

async function handleRetranslateSegment(params: {
  segmentId: string
  stableId: string
}): Promise<void> {
  if (!props.paperId) {
    return
  }

  const result = await paperReaderStore.retranslateSegment(
    props.paperId,
    params.segmentId,
    params.stableId
  )
  if (!result.success) {
    notify.error('重新翻译失败', result.error || '请稍后再试', {
      source: 'paper',
      dedupeKey: `paper-retranslate:${props.paperId}:${params.segmentId}:${result.error || ''}`
    })
  }
}

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

function handleMarkdownClick(event: MouseEvent): void {
  if (Date.now() - lastTableDragEndedAt < 160) {
    event.preventDefault()
    event.stopPropagation()
    return
  }

  composer.handleSurfaceAnnotationClick(event)
}

function handleDocumentKeyDown(event: KeyboardEvent): void {
  // 搜索快捷键优先处理
  if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
    event.preventDefault()
    if (textSearch.isOpen.value) {
      searchInputRef.value?.focus()
      searchInputRef.value?.select()
    } else {
      textSearch.openSearch()
      const selection = window.getSelection()?.toString().trim()
      if (selection && selection.length <= 200) {
        textSearch.query.value = selection
      }
    }
    return
  }

  if (event.key === 'Escape' && textSearch.isOpen.value) {
    event.preventDefault()
    textSearch.closeSearch()
    return
  }

  composer.handleDocumentKeyDown(event)
}

function handleSearchInputKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    const contentEl = scrollContainerRef.value?.querySelector('.paper-markdown-view__content')
    if (contentEl instanceof HTMLElement) {
      textSearch.search(contentEl, textSearch.query.value)
    }
    if (event.shiftKey) {
      textSearch.goToPrevious()
    } else {
      textSearch.goToNext()
    }
  }
}

watch(textSearch.query, (newQuery) => {
  if (!textSearch.isOpen.value) return
  const contentEl = scrollContainerRef.value?.querySelector('.paper-markdown-view__content')
  if (contentEl instanceof HTMLElement) {
    textSearch.search(contentEl, newQuery)
  }
})

watch(textSearch.isOpen, (open) => {
  if (open) {
    nextTick(() => {
      searchInputRef.value?.focus()
      if (textSearch.query.value) {
        searchInputRef.value?.select()
      }
    })
  }
})

watch(markdownZoomLevel, async () => {
  await nextTick()
  syncScrollableTableWrapState()
})

if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', composer.handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeyDown)
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', syncScrollableTableWrapState)
}

onBeforeUnmount(() => {
  recordMarkdownScrollPosition()
  paperReaderStore.clearPaperToc()
  textSearch.closeSearch()
  clearTableDragState()
  if (typeof document !== 'undefined') {
    document.removeEventListener('mousedown', composer.handleDocumentPointerDown)
    document.removeEventListener('keydown', handleDocumentKeyDown)
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', syncScrollableTableWrapState)
  }
})
</script>

<template>
  <div class="paper-markdown-view">
    <div v-if="textSearch.isOpen.value" class="paper-markdown-view__search-bar">
      <input
        ref="searchInputRef"
        v-model="textSearch.query.value"
        type="text"
        class="paper-markdown-view__search-input"
        placeholder="搜索..."
        @keydown="handleSearchInputKeydown"
      />
      <span v-if="textSearch.hasMatches.value" class="paper-markdown-view__search-count">
        {{ textSearch.currentIndex.value + 1 }} / {{ textSearch.matchCount.value }}
      </span>
      <span v-else-if="textSearch.query.value.trim()" class="paper-markdown-view__search-count">
        无结果
      </span>
      <button
        class="paper-markdown-view__search-btn"
        type="button"
        :disabled="!textSearch.hasMatches.value"
        title="上一个 (Shift+Enter)"
        @click="textSearch.goToPrevious()"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <button
        class="paper-markdown-view__search-btn"
        type="button"
        :disabled="!textSearch.hasMatches.value"
        title="下一个 (Enter)"
        @click="textSearch.goToNext()"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <button
        class="paper-markdown-view__search-btn paper-markdown-view__search-btn--close"
        type="button"
        title="关闭 (Esc)"
        @click="textSearch.closeSearch()"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <div
      ref="scrollContainerRef"
      class="paper-markdown-view__scroll"
      @mouseup="composer.updateComposerFromSelection"
      @click="handleMarkdownClick"
      @pointerdown="handleTablePointerDown"
      @scroll="recordMarkdownScrollPosition"
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
          :outdated-updating="composer.outdatedAnnotationUpdating.value"
          :outdated-error="composer.outdatedAnnotationError.value"
          :on-retranslate="paperReaderStore.toggleTranslationVisible"
          :on-view-in-original="handleViewTranslationMissingInOriginal"
          :on-update-outdated="handleUpdateOutdatedAnnotationsToCurrentTranslation"
        />

        <PaperMarkdownAnnotationManager :actions="annotationManagerActions" />

        <PaperMarkdownSegmentList
          :segments="engine.renderedSegments.value"
          @retranslate="handleRetranslateSegment"
        />
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
      :is-existing-note="composer.noteEditorIsExistingNote.value"
      :can-update="composer.noteEditorCanUpdate.value"
      :saving="composer.noteEditorSaving.value"
      :error="composer.noteEditorError.value"
      @update:comment="composer.noteEditorComment.value = $event"
      @save="composer.handleSaveNote"
      @update-note="composer.handleUpdateNote"
      @delete-note="composer.handleDeleteNoteFromEditor"
      @close="composer.handleCloseNoteEditor"
      @move="composer.handleMoveNoteEditor"
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
  position: relative;
}

.paper-markdown-view__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--sm-color-border-strong) transparent;
  scrollbar-gutter: stable;
  padding: calc(var(--sm-paper-toolbar-height) + var(--sm-space-2)) var(--sm-space-4)
    var(--sm-space-6);
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
  animation: quote-highlight-fade 8s ease-out forwards;
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

.paper-markdown-view__search-bar {
  position: absolute;
  top: calc(var(--sm-paper-toolbar-height) + var(--sm-space-2));
  right: 24px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  box-shadow:
    0 16px 40px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
  font-size: 13px;
}

.paper-markdown-view__search-input {
  width: 180px;
  padding: 4px 8px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color var(--sm-transition-fast);
}

.paper-markdown-view__search-input:focus {
  border-color: var(--sm-color-accent);
}

.paper-markdown-view__search-count {
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  min-width: 48px;
  text-align: center;
  user-select: none;
}

.paper-markdown-view__search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--sm-radius-sm);
  background: transparent;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  transition:
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.paper-markdown-view__search-btn:hover:not(:disabled) {
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__search-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

:deep(mark.paper-markdown-view__search-highlight) {
  background: color-mix(in srgb, var(--sm-color-accent) 20%, transparent);
  border-radius: 2px;
  color: inherit;
}

:deep(mark.paper-markdown-view__search-highlight--current) {
  background: color-mix(in srgb, var(--sm-color-accent) 50%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--sm-color-accent) 70%, transparent);
}
</style>
