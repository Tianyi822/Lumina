<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance
} from 'vue'
import { storeToRefs } from 'pinia'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { PaperPageAsset } from '@shared/types/paper'
import { buildBase64DataUrl } from '@shared/utils'
import { useZoomAnchor } from './composables/useZoomAnchor'

const props = defineProps<{
  paperId: string
  pageAssets?: PaperPageAsset[]
  pageCount?: number
}>()

interface OriginalPdfPage {
  pageIndex: number
  width: number
  height: number
  imageMimeType: string
  available: boolean
}

interface PageLoadState {
  status: 'idle' | 'loading' | 'loaded' | 'error'
  dataUrl?: string
  error?: string
}

const paperReaderStore = usePaperReaderStore()
const { originalPdfZoomLevel } = storeToRefs(paperReaderStore)

const scrollContainerRef = ref<HTMLElement | null>(null)

const zoomAnchor = useZoomAnchor()

let zoomSettleTimer: ReturnType<typeof setTimeout> | null = null

watch(originalPdfZoomLevel, (newVal, oldVal) => {
  const container = scrollContainerRef.value
  if (!container || !oldVal || newVal === oldVal) return

  if (!zoomAnchor.isZooming()) {
    zoomAnchor.beginZoom(container)
  }

  nextTick(() => {
    if (scrollContainerRef.value) {
      zoomAnchor.applyZoomFrame(scrollContainerRef.value)
    }
  })

  if (zoomSettleTimer !== null) clearTimeout(zoomSettleTimer)
  zoomSettleTimer = setTimeout(() => {
    zoomSettleTimer = null
    zoomAnchor.endZoom()
  }, 150)
})

const pageStates = ref<Record<number, PageLoadState>>({})
const pageElementByIndex = new Map<number, HTMLElement>()
const observedPageIndexes = new Set<number>()
let observer: IntersectionObserver | null = null
let isMounted = false

const originalPages = computed<OriginalPdfPage[]>(() => {
  const assets = [...(props.pageAssets || [])].sort((a, b) => a.pageIndex - b.pageIndex)
  const assetByIndex = new Map(assets.map((asset) => [asset.pageIndex, asset]))
  const totalPages = Math.max(props.pageCount || 0, assets.length)

  return Array.from({ length: totalPages }, (_, pageIndex) => {
    const asset = assetByIndex.get(pageIndex)
    const width = asset?.sourceWidth || asset?.imageWidth || 612
    const height = asset?.sourceHeight || asset?.imageHeight || 792

    return {
      pageIndex,
      width: Math.max(width, 1),
      height: Math.max(height, 1),
      imageMimeType: asset?.imageMimeType || 'image/jpeg',
      available: !!asset
    }
  })
})

const pageSignature = computed(() => {
  return originalPages.value
    .map((page) => `${page.pageIndex}:${page.width}:${page.height}:${page.available}`)
    .join('|')
})

const contentZoomStyle = computed(() => ({
  zoom: originalPdfZoomLevel.value
}))

const hasPages = computed(() => originalPages.value.length > 0)

let scrollRafId: number | null = null

function recordOriginalPdfScrollPosition(): void {
  if (!props.paperId || !scrollContainerRef.value || zoomAnchor.isZooming()) {
    return
  }

  if (scrollRafId !== null) {
    return
  }

  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    if (!props.paperId || !scrollContainerRef.value) return
    paperReaderStore.setOriginalPdfScrollPosition(props.paperId, {
      scrollTop: scrollContainerRef.value.scrollTop,
      scrollLeft: scrollContainerRef.value.scrollLeft
    })
  })
}

async function restoreOriginalPdfScrollPosition(paperId: string): Promise<void> {
  const position = paperReaderStore.getOriginalPdfScrollPosition(paperId)
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

function getPageState(pageIndex: number): PageLoadState {
  return pageStates.value[pageIndex] || { status: 'idle' }
}

function getPageStyle(page: OriginalPdfPage): Record<string, string> {
  return {
    '--paper-original-page-width': `${page.width}px`,
    '--paper-original-page-aspect': `${page.width} / ${page.height}`
  }
}

function setPageState(pageIndex: number, state: PageLoadState): void {
  pageStates.value = {
    ...pageStates.value,
    [pageIndex]: state
  }
}

function findPage(pageIndex: number): OriginalPdfPage | undefined {
  return originalPages.value.find((page) => page.pageIndex === pageIndex)
}

async function loadPage(pageIndex: number): Promise<void> {
  const page = findPage(pageIndex)
  if (!page) {
    return
  }

  const currentState = getPageState(pageIndex)
  if (currentState.status === 'loading' || currentState.status === 'loaded') {
    return
  }

  if (!page.available) {
    setPageState(pageIndex, {
      status: 'error',
      error: '页图不存在'
    })
    return
  }

  const paperId = props.paperId
  setPageState(pageIndex, { status: 'loading' })

  const result = await window.api.paper.getPageImage({
    paperId,
    pageIndex
  })

  if (props.paperId !== paperId) {
    return
  }

  if (!result.success || !result.data) {
    setPageState(pageIndex, {
      status: 'error',
      error: result.error || '读取页图失败'
    })
    return
  }

  setPageState(pageIndex, {
    status: 'loaded',
    dataUrl: buildBase64DataUrl(result.data, page.imageMimeType)
  })
}

function loadInitialPages(): void {
  for (const page of originalPages.value.slice(0, 2)) {
    void loadPage(page.pageIndex)
  }
}

function disposeObserver(): void {
  observer?.disconnect()
  observer = null
  observedPageIndexes.clear()
}

function observePage(pageIndex: number, element: HTMLElement): void {
  if (!observer || observedPageIndexes.has(pageIndex)) {
    return
  }

  const state = getPageState(pageIndex)
  if (state.status === 'loading' || state.status === 'loaded') {
    return
  }

  observer.observe(element)
  observedPageIndexes.add(pageIndex)
}

function refreshObservedPages(): void {
  if (!observer) {
    return
  }

  for (const [pageIndex, element] of pageElementByIndex.entries()) {
    observePage(pageIndex, element)
  }
}

function createObserver(): void {
  if (
    typeof window === 'undefined' ||
    !('IntersectionObserver' in window) ||
    !scrollContainerRef.value
  ) {
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue
        }

        const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex)
        if (!Number.isInteger(pageIndex)) {
          continue
        }

        observer?.unobserve(entry.target)
        observedPageIndexes.delete(pageIndex)
        void loadPage(pageIndex)
      }
    },
    {
      root: scrollContainerRef.value,
      rootMargin: '900px 0px',
      threshold: 0.01
    }
  )
}

async function resetPageLoading(): Promise<void> {
  pageStates.value = {}
  disposeObserver()
  await nextTick()
  createObserver()
  loadInitialPages()

  if (!observer) {
    for (const page of originalPages.value.slice(2)) {
      void loadPage(page.pageIndex)
    }
    await restoreOriginalPdfScrollPosition(props.paperId)
    return
  }

  refreshObservedPages()
  await restoreOriginalPdfScrollPosition(props.paperId)
}

function setPageElement(
  pageIndex: number,
  element: Element | ComponentPublicInstance | null
): void {
  if (element instanceof HTMLElement) {
    pageElementByIndex.set(pageIndex, element)
    observePage(pageIndex, element)
    return
  }

  const existingElement = pageElementByIndex.get(pageIndex)
  if (existingElement && observer) {
    observer.unobserve(existingElement)
  }
  pageElementByIndex.delete(pageIndex)
  observedPageIndexes.delete(pageIndex)
}

watch(
  () => [props.paperId, pageSignature.value],
  () => {
    if (isMounted) {
      void resetPageLoading()
    }
  }
)

onMounted(() => {
  isMounted = true
  void resetPageLoading()
})

onBeforeUnmount(() => {
  recordOriginalPdfScrollPosition()
  isMounted = false
  disposeObserver()
  pageElementByIndex.clear()
})
</script>

<template>
  <div class="paper-original-pdf-view">
    <div
      ref="scrollContainerRef"
      class="paper-original-pdf-view__scroll"
      @scroll="recordOriginalPdfScrollPosition"
      @wheel="paperReaderStore.handleWheelZoom"
    >
      <div v-if="!hasPages" class="paper-original-pdf-view__empty">
        <p>暂无 PDF 原件页图</p>
      </div>

      <div v-else class="paper-original-pdf-view__content" :style="contentZoomStyle">
        <section
          v-for="page in originalPages"
          :key="page.pageIndex"
          :ref="(element) => setPageElement(page.pageIndex, element)"
          class="paper-original-pdf-view__page"
          :style="getPageStyle(page)"
          :data-page-index="page.pageIndex"
        >
          <img
            v-if="getPageState(page.pageIndex).status === 'loaded'"
            class="paper-original-pdf-view__image"
            :src="getPageState(page.pageIndex).dataUrl"
            :alt="`第 ${page.pageIndex + 1} 页原件`"
          />

          <div
            v-else-if="getPageState(page.pageIndex).status === 'error'"
            class="paper-original-pdf-view__state paper-original-pdf-view__state--error"
          >
            {{ getPageState(page.pageIndex).error }}
          </div>

          <div v-else class="paper-original-pdf-view__state">
            正在加载第 {{ page.pageIndex + 1 }} 页
          </div>

          <div class="paper-original-pdf-view__page-number">
            {{ page.pageIndex + 1 }}
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paper-original-pdf-view {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.paper-original-pdf-view__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: calc(var(--sm-paper-toolbar-height) + var(--sm-space-2)) var(--sm-space-5)
    var(--sm-space-6);
  scrollbar-width: thin;
  scrollbar-color: var(--sm-color-border-strong) transparent;
  scrollbar-gutter: stable;
}

.paper-original-pdf-view__scroll::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.paper-original-pdf-view__scroll::-webkit-scrollbar-track {
  background: transparent;
}

.paper-original-pdf-view__scroll::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 999px;
  background: var(--sm-color-border-strong);
  background-clip: content-box;
}

.paper-original-pdf-view__scroll::-webkit-scrollbar-thumb:hover {
  background: var(--sm-color-text-tertiary);
  background-clip: content-box;
}

.paper-original-pdf-view__content {
  width: max-content;
  min-width: min(100%, 720px);
  max-width: none;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sm-space-5);
}

.paper-original-pdf-view__page {
  position: relative;
  width: var(--paper-original-page-width);
  max-width: min(100%, calc(100vw - 96px));
  aspect-ratio: var(--paper-original-page-aspect);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: #fff;
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}

.paper-original-pdf-view__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fff;
}

.paper-original-pdf-view__state,
.paper-original-pdf-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sm-color-text-tertiary);
  font-size: 13px;
  line-height: 1.6;
}

.paper-original-pdf-view__state {
  position: absolute;
  inset: 0;
  padding: var(--sm-space-4);
  background: var(--sm-color-surface-1);
}

.paper-original-pdf-view__state--error {
  color: var(--sm-color-status-danger);
}

.paper-original-pdf-view__empty {
  min-height: 220px;
}

.paper-original-pdf-view__page-number {
  position: absolute;
  right: var(--sm-space-3);
  bottom: var(--sm-space-3);
  min-width: 24px;
  height: 20px;
  padding: 0 var(--sm-space-2);
  border-radius: 999px;
  background: color-mix(in srgb, var(--sm-color-bg-canvas) 74%, transparent);
  color: var(--sm-color-text-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 20px;
  text-align: center;
  pointer-events: none;
}
</style>
