<script setup lang="ts">
/**
 * 文件选择模态框
 * 从已有文件选择或上传新文件到知识库
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
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
const fileStore = useFileStore()
const { files } = storeToRefs(fileStore)
const { loadFiles } = fileStore

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

  return Math.ceil(panel.scrollHeight)
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
  panelShell.style.height = `${height}px`
}

function lockPanelShellHeight(): number {
  const panelShell = panelShellRef.value
  if (!panelShell) {
    return 0
  }

  const currentHeight = Math.ceil(panelShell.offsetHeight)
  setPanelShellHeight(currentHeight)
  panelShell.offsetHeight
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
  if (event.target === panelShellRef.value && event.propertyName === 'height') {
    isPanelHeightTransitioning = false

    if (pendingVisibleTab) {
      finishPendingPanelTransition()
      return
    }

    clearPanelTransitionTimer()
    observePanelContent()
  }
}

watch(activeTab, async () => {
  pendingVisibleTab = null
  clearPanelTransitionTimer()
  clearPanelHeightAnimationFrame()
  const fromHeight = lockPanelShellHeight()

  await nextTick()
  const nextHeight = readPanelHeight(activeTab.value)
  if (nextHeight <= 0) {
    return
  }

  const isGrowing = nextHeight > fromHeight + 1
  isPanelHeightTransitioning = true

  if (isGrowing) {
    isPanelContentVisible.value = false
    pendingVisibleTab = activeTab.value
    await nextTick()
    panelShellRef.value?.offsetHeight
    animatePanelShellHeightTo(nextHeight)
    panelTransitionTimer = window.setTimeout(
      finishPendingPanelTransition,
      PANEL_HEIGHT_TRANSITION_FALLBACK_MS
    )
    return
  }

  visibleTab.value = activeTab.value
  isPanelContentVisible.value = true
  await nextTick()
  animatePanelShellHeightTo(nextHeight)
  panelTransitionTimer = window.setTimeout(() => {
    isPanelHeightTransitioning = false
    clearPanelTransitionTimer()
    observePanelContent()
  }, PANEL_HEIGHT_TRANSITION_FALLBACK_MS)
})

// 生命周期
onMounted(async () => {
  await loadFiles()
  await nextTick()
  observePanelContent()
  syncVisiblePanelHeight()
})

onBeforeUnmount(() => {
  panelResizeObserver?.disconnect()
  clearPanelTransitionTimer()
  clearPanelHeightAnimationFrame()
})
</script>

<template>
  <div class="sm-modal__overlay file-selector-overlay" @click.self="emit('close')">
    <div class="sm-modal__surface file-selector-container">
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
          <UploadTab
            :kb-id="kbId"
            @close="emit('close')"
            @upload-complete="handleUploadComplete"
          />
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
  overflow: hidden;
  transition: height 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.file-selector-panel {
  width: 100%;
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

.file-selector-panel-shell.is-measured .file-selector-panel,
.file-selector-panel-shell:not(.is-measured) .file-selector-panel:not(.is-active) {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
}

.file-selector-panel.is-active {
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
