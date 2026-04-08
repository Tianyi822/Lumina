<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'

const paperReaderStore = usePaperReaderStore()
const { activeFigure, figurePreviewPinned, figurePreviewRect, figurePreviewImageRatio } =
  storeToRefs(paperReaderStore)

const previewRef = ref<HTMLElement | null>(null)

interface PointerState {
  clientX: number
  clientY: number
}

const dragState = ref<PointerState | null>(null)
const resizeState = ref<PointerState | null>(null)

const previewStyle = computed(() => {
  return {
    left: `${figurePreviewRect.value.left}px`,
    top: `${figurePreviewRect.value.top}px`,
    width: `${figurePreviewRect.value.width}px`
  }
})

const imageShellStyle = computed(() => {
  const ratio = figurePreviewImageRatio.value > 0 ? figurePreviewImageRatio.value : 0.75
  return {
    height: `${figurePreviewRect.value.width * ratio}px`
  }
})

const previewCaption = computed(() => {
  if (activeFigure.value?.caption) {
    return activeFigure.value.caption
  }

  if (activeFigure.value?.subCaption) {
    return activeFigure.value.subCaption
  }

  return '暂无图注'
})

function stopInteractions(): void {
  dragState.value = null
  resizeState.value = null
  window.removeEventListener('mousemove', handlePointerMove)
  window.removeEventListener('mouseup', handlePointerUp)
}

function handlePointerMove(event: MouseEvent): void {
  if (dragState.value) {
    paperReaderStore.moveFigurePreview({
      x: event.clientX - dragState.value.clientX,
      y: event.clientY - dragState.value.clientY
    })
    dragState.value = {
      clientX: event.clientX,
      clientY: event.clientY
    }
  }

  if (resizeState.value) {
    paperReaderStore.resizeFigurePreview(
      figurePreviewRect.value.width + (event.clientX - resizeState.value.clientX)
    )
    resizeState.value = {
      clientX: event.clientX,
      clientY: event.clientY
    }
  }
}

function handlePointerUp(): void {
  stopInteractions()
}

function handleDragStart(event: MouseEvent): void {
  if (event.button !== 0) {
    return
  }

  dragState.value = {
    clientX: event.clientX,
    clientY: event.clientY
  }

  window.addEventListener('mousemove', handlePointerMove)
  window.addEventListener('mouseup', handlePointerUp)
}

function handleResizeStart(event: MouseEvent): void {
  if (event.button !== 0) {
    return
  }

  resizeState.value = {
    clientX: event.clientX,
    clientY: event.clientY
  }

  window.addEventListener('mousemove', handlePointerMove)
  window.addEventListener('mouseup', handlePointerUp)
}

function handleImageLoad(event: Event): void {
  const image = event.target as HTMLImageElement
  if (!image.naturalWidth || !image.naturalHeight) {
    return
  }

  paperReaderStore.setFigurePreviewImageRatio(image.naturalHeight / image.naturalWidth)
}

function handleDocumentMouseDown(event: MouseEvent): void {
  if (!activeFigure.value || figurePreviewPinned.value || !previewRef.value) {
    return
  }

  const target = event.target as Node
  if (!previewRef.value.contains(target)) {
    paperReaderStore.closeFigurePreview()
  }
}

function handleDocumentKeyDown(event: KeyboardEvent): void {
  if (!activeFigure.value || figurePreviewPinned.value) {
    return
  }

  if (event.key === 'Escape') {
    paperReaderStore.closeFigurePreview()
  }
}

function togglePinned(): void {
  paperReaderStore.setFigurePreviewPinned(!figurePreviewPinned.value)
}

watch(activeFigure, (value) => {
  if (!value) {
    stopInteractions()
  }
})

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentMouseDown)
  document.addEventListener('keydown', handleDocumentKeyDown)
})

onBeforeUnmount(() => {
  stopInteractions()
  document.removeEventListener('mousedown', handleDocumentMouseDown)
  document.removeEventListener('keydown', handleDocumentKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="activeFigure"
      ref="previewRef"
      class="paper-figure-preview"
      :style="previewStyle"
      role="dialog"
      aria-label="论文图片预览"
    >
      <div class="paper-figure-preview__header" @mousedown.prevent="handleDragStart">
        <div class="paper-figure-preview__meta">
          <div class="paper-figure-preview__title">论文图片预览</div>
          <div class="paper-figure-preview__subtitle">第 {{ activeFigure.pageIndex + 1 }} 页</div>
        </div>

        <div class="paper-figure-preview__actions" @mousedown.stop>
          <button
            class="sm-icon-button paper-figure-preview__action"
            :class="{ 'is-active': figurePreviewPinned }"
            :title="figurePreviewPinned ? '取消钉住' : '钉住预览窗'"
            :aria-label="figurePreviewPinned ? '取消钉住' : '钉住预览窗'"
            type="button"
            @click.stop="togglePinned"
          >
            <SvgIcon :name="figurePreviewPinned ? 'pin-filled' : 'pin'" :size="14" />
          </button>

          <button
            class="sm-icon-button paper-figure-preview__action"
            title="关闭"
            aria-label="关闭图片预览"
            type="button"
            @click.stop="paperReaderStore.closeFigurePreview()"
          >
            <SvgIcon name="close" :size="14" />
          </button>
        </div>
      </div>

      <div class="paper-figure-preview__body">
        <div class="paper-figure-preview__image-shell" :style="imageShellStyle">
          <img
            :src="activeFigure.imagePath"
            :alt="previewCaption"
            class="paper-figure-preview__image"
            @load="handleImageLoad"
          />
        </div>

        <div class="paper-figure-preview__caption">
          {{ previewCaption }}
        </div>
      </div>

      <button
        class="paper-figure-preview__resize"
        type="button"
        aria-label="缩放图片预览"
        @mousedown.prevent.stop="handleResizeStart"
      ></button>
    </div>
  </Teleport>
</template>

<style scoped>
.paper-figure-preview {
  position: fixed;
  z-index: 80;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 14px;
  background: var(--sm-color-surface-2);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  max-height: calc(100vh - 32px);
}

.paper-figure-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  padding: var(--sm-space-3);
  border-bottom: 1px solid var(--sm-color-border-subtle);
  cursor: move;
  user-select: none;
}

.paper-figure-preview__meta {
  min-width: 0;
}

.paper-figure-preview__title {
  color: var(--sm-color-text-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.paper-figure-preview__subtitle {
  margin-top: 2px;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  line-height: 1.4;
}

.paper-figure-preview__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-shrink: 0;
}

.paper-figure-preview__action {
  width: 30px;
  height: 30px;
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
}

.paper-figure-preview__action.is-active,
.paper-figure-preview__action:hover {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
}

.paper-figure-preview__body {
  overflow: auto;
}

.paper-figure-preview__image-shell {
  width: 100%;
  background: var(--sm-color-surface-1);
  overflow: hidden;
}

.paper-figure-preview__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.paper-figure-preview__caption {
  padding: var(--sm-space-3);
  border-top: 1px solid var(--sm-color-border-subtle);
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.paper-figure-preview__resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  cursor: nwse-resize;
}

.paper-figure-preview__resize::before {
  content: '';
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 10px;
  height: 10px;
  border-right: 2px solid var(--sm-color-border-strong);
  border-bottom: 2px solid var(--sm-color-border-strong);
  opacity: 0.7;
}
</style>
