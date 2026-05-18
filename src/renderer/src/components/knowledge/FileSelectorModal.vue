<script setup lang="ts">
/**
 * 文件选择模态框
 * 从已有文件选择或上传新文件到知识库
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import type { UploadResult } from './shared/composables/useFileUpload'
import { FileSelectorHeader, FileSelectorTabs, ExistingFilesTab, UploadTab } from './file-selector'
import { useFileSelection } from './file-selector/composables/useFileSelection'

const props = defineProps<{
  kbId: string
  linkedFileIds: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'filesLinked', files: FileItem[]): void
}>()

// 标签页
type TabType = 'existing' | 'upload'
const activeTab = ref<TabType>('existing')
const visibleTab = ref<TabType>('existing')
const isPanelContentVisible = ref(true)
const containerRef = ref<HTMLElement | null>(null)
const panelShellRef = ref<HTMLElement | null>(null)
const existingPanelRef = ref<HTMLElement | null>(null)
const uploadPanelRef = ref<HTMLElement | null>(null)
const isPanelMeasured = ref(false)
let panelResizeObserver: ResizeObserver | null = null
let panelHeightAnimationFrame: number | null = null
let pendingVisibleTab: TabType | null = null
let panelTransitionTimer: number | null = null
let isPanelHeightTransitioning = false

const PANEL_HEIGHT_TRANSITION_MS = 220
const PANEL_HEIGHT_TRANSITION_FALLBACK_MS = PANEL_HEIGHT_TRANSITION_MS + 80

// 文件管理
const fileStore = useZustandStore(useFileStore)
const files = computed(() => fileStore.files)

// 文件选择逻辑
const {
  selectedFileIds,
  linkingFileIds,
  toggleSelection,
  selectAll,
  deselectAll,
  linkSelectedFiles
} = useFileSelection(files, props.kbId)

// 处理选择切换
function handleToggle(fileId: string): void {
  toggleSelection(fileId)
}

// 处理全选
function handleSelectAll(availableFiles: FileItem[]): void {
  selectAll(availableFiles)
}

// 处理关联选中文件
async function handleLinkSelected(): Promise<void> {
  const linkedFiles = await linkSelectedFiles()
  if (linkedFiles.length > 0) {
    emit('filesLinked', linkedFiles)
  }
}

// 处理上传完成
function handleUploadComplete(result: UploadResult): void {
  // useFileUpload 已在 autoLinkToKB 模式下完成关联，直接通知父组件更新 UI
  const newFiles = [...result.uploaded, ...result.duplicates]
  if (newFiles.length > 0) {
    emit('filesLinked', newFiles)
  }
}

function getPanelElement(tab: TabType): HTMLElement | null {
  return tab === 'existing' ? existingPanelRef.value : uploadPanelRef.value
}

function readPanelHeight(tab: TabType): number {
  const panel = getPanelElement(tab)
  if (!panel) {
    return 0
  }

  return Math.min(Math.ceil(panel.scrollHeight), readPanelAvailableHeight())
}

function readPanelAvailableHeight(): number {
  const container = containerRef.value
  const panelShell = panelShellRef.value
  if (!container || !panelShell) {
    return Number.POSITIVE_INFINITY
  }

  const containerStyles = window.getComputedStyle(container)
  const panelShellRect = panelShell.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const maxContainerHeight = parseFloat(containerStyles.maxHeight)
  const containerHeightLimit = Number.isFinite(maxContainerHeight)
    ? maxContainerHeight
    : container.clientHeight
  const panelShellTop = panelShellRect.top - containerRect.top
  const availableHeight = Math.floor(containerHeightLimit - panelShellTop)

  return Math.max(1, availableHeight)
}

function clearPanelHeightAnimationFrame(): void {
  if (panelHeightAnimationFrame !== null) {
    window.cancelAnimationFrame(panelHeightAnimationFrame)
    panelHeightAnimationFrame = null
  }
}

function setPanelShellHeight(height: number): void {
  const panelShell = panelShellRef.value
  if (!panelShell || height <= 0) {
    return
  }

  isPanelMeasured.value = true
  panelShell.style.height = `${Math.min(height, readPanelAvailableHeight())}px`
}

function lockPanelShellHeight(): number {
  const panelShell = panelShellRef.value
  if (!panelShell) {
    return 0
  }

  const currentHeight = Math.ceil(panelShell.offsetHeight)
  setPanelShellHeight(currentHeight)
  void panelShell.offsetHeight
  return currentHeight
}

function animatePanelShellHeightTo(nextHeight: number): void {
  clearPanelHeightAnimationFrame()

  panelHeightAnimationFrame = window.requestAnimationFrame(() => {
    panelHeightAnimationFrame = null
    setPanelShellHeight(nextHeight)
  })
}

function syncVisiblePanelHeight(): void {
  const nextHeight = readPanelHeight(visibleTab.value)
  if (nextHeight > 0) {
    lockPanelShellHeight()
    animatePanelShellHeightTo(nextHeight)
  }
}

function observePanelContent(): void {
  panelResizeObserver?.disconnect()

  if (typeof ResizeObserver === 'undefined') {
    return
  }

  panelResizeObserver = new ResizeObserver(() => {
    if (!pendingVisibleTab && !isPanelHeightTransitioning && isPanelContentVisible.value) {
      syncVisiblePanelHeight()
    }
  })

  if (existingPanelRef.value) {
    panelResizeObserver.observe(existingPanelRef.value)
  }
  if (uploadPanelRef.value) {
    panelResizeObserver.observe(uploadPanelRef.value)
  }
}

function clearPanelTransitionTimer(): void {
  if (panelTransitionTimer !== null) {
    window.clearTimeout(panelTransitionTimer)
    panelTransitionTimer = null
  }
}

function finishPendingPanelTransition(): void {
  if (!pendingVisibleTab) {
    return
  }

  visibleTab.value = pendingVisibleTab
  pendingVisibleTab = null
  isPanelContentVisible.value = true
  isPanelHeightTransitioning = false
  clearPanelTransitionTimer()

  nextTick(() => {
    observePanelContent()
    syncVisiblePanelHeight()
  })
}

function handlePanelShellTransitionEnd(event: TransitionEvent): void {
  if (
    event.target !== panelShellRef.value ||
    event.propertyName !== 'height' ||
    !isPanelHeightTransitioning
  ) {
    return
  }

  isPanelHeightTransitioning = false

  if (pendingVisibleTab) {
    finishPendingPanelTransition()
    return
  }

  clearPanelTransitionTimer()
  observePanelContent()
}

watch(activeTab, async () => {
  pendingVisibleTab = null
  clearPanelTransitionTimer()
  clearPanelHeightAnimationFrame()
  lockPanelShellHeight()

  await nextTick()
  const nextHeight = readPanelHeight(activeTab.value)
  if (nextHeight <= 0) {
    return
  }

  isPanelHeightTransitioning = true
  isPanelContentVisible.value = false
  pendingVisibleTab = activeTab.value
  await nextTick()
  void panelShellRef.value?.offsetHeight
  animatePanelShellHeightTo(nextHeight)
  panelTransitionTimer = window.setTimeout(
    finishPendingPanelTransition,
    PANEL_HEIGHT_TRANSITION_FALLBACK_MS
  )
})

// 生命周期
onMounted(async () => {
  await fileStore.loadFiles()
  await nextTick()
  observePanelContent()
  syncVisiblePanelHeight()
  window.addEventListener('resize', syncVisiblePanelHeight)
})

onBeforeUnmount(() => {
  panelResizeObserver?.disconnect()
  clearPanelTransitionTimer()
  clearPanelHeightAnimationFrame()
  window.removeEventListener('resize', syncVisiblePanelHeight)
})
</script>

<template>
  <div class="sm-modal__overlay file-selector-overlay" @click.self="emit('close')">
    <div ref="containerRef" class="sm-modal__surface file-selector-container">
      <FileSelectorHeader @close="emit('close')" />

      <FileSelectorTabs v-model:active-tab="activeTab" />

      <div
        ref="panelShellRef"
        class="file-selector-panel-shell"
        :class="{ 'is-measured': isPanelMeasured }"
        @transitionend="handlePanelShellTransitionEnd"
      >
        <div
          ref="existingPanelRef"
          class="file-selector-panel"
          :class="{ 'is-active': visibleTab === 'existing' && isPanelContentVisible }"
          :aria-hidden="visibleTab !== 'existing' || !isPanelContentVisible"
          :inert="visibleTab !== 'existing' || !isPanelContentVisible"
        >
          <ExistingFilesTab
            :kb-id="kbId"
            :linked-file-ids="linkedFileIds"
            :selected-file-ids="selectedFileIds"
            :linking-file-ids="linkingFileIds"
            @toggle="handleToggle"
            @select-all="handleSelectAll"
            @deselect-all="deselectAll"
            @link-selected="handleLinkSelected"
            @close="emit('close')"
          />
        </div>

        <div
          ref="uploadPanelRef"
          class="file-selector-panel"
          :class="{ 'is-active': visibleTab === 'upload' && isPanelContentVisible }"
          :aria-hidden="visibleTab !== 'upload' || !isPanelContentVisible"
          :inert="visibleTab !== 'upload' || !isPanelContentVisible"
        >
          <UploadTab :kb-id="kbId" @close="emit('close')" @upload-complete="handleUploadComplete" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-selector-overlay {
  z-index: 1000;
}

.file-selector-container {
  width: min(680px, calc(100vw - 72px));
  max-height: min(760px, calc(100vh - 104px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-selector-panel-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: height 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.file-selector-panel {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  opacity: 0;
  transform: translateY(8px) scale(0.992);
  pointer-events: none;
  transition:
    opacity 180ms ease,
    transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.file-selector-panel-shell.is-measured .file-selector-panel:not(.is-active),
.file-selector-panel-shell:not(.is-measured) .file-selector-panel:not(.is-active) {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
}

.file-selector-panel.is-active {
  height: 100%;
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

@media (max-width: 720px) {
  .file-selector-container {
    width: calc(100vw - 32px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .file-selector-panel {
    transition: none;
  }

  .file-selector-panel-shell {
    transition: none;
  }
}
</style>
