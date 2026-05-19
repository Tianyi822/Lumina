<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { PaperFigurePreviewRect } from '@renderer/stores/paperReaderStore'
import {
  PAPER_FIGURE_PREVIEW_MIN_HEIGHT,
  PAPER_FIGURE_PREVIEW_MIN_WIDTH
} from '@renderer/stores/paper/shared'
import styles from './PaperFigurePreview.module.css'

const paperReaderStore = useZustandStore(usePaperReaderStore)

// 状态属性（通过 computed 保持响应式）
const activeFigure = computed(() => paperReaderStore.activeFigure)
const figurePreviewPinned = computed(() => paperReaderStore.figurePreviewPinned)
const figurePreviewRect = computed(() => paperReaderStore.figurePreviewRect)
const translationVisible = computed(() => paperReaderStore.translationVisible)

// Getter 函数（需要显式调用）
const currentPaperFigures = computed(() => paperReaderStore.currentPaperFigures())
const figureCaptionTranslationMap = computed(() => paperReaderStore.figureCaptionTranslationMap())

const previewRef = ref<HTMLElement | null>(null)

interface PointerState {
  clientX: number
  clientY: number
}

type ResizeEdge =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-right'
  | 'bottom-left'

interface ResizeState extends PointerState {
  edge: ResizeEdge
  rect: PaperFigurePreviewRect
}

interface ResizeHandle {
  edge: ResizeEdge
  label: string
}

const dragState = ref<PointerState | null>(null)
const resizeState = ref<ResizeState | null>(null)
const resizeHandles: ResizeHandle[] = [
  { edge: 'top', label: '从上边缩放图片预览' },
  { edge: 'right', label: '从右边缩放图片预览' },
  { edge: 'bottom', label: '从下边缩放图片预览' },
  { edge: 'left', label: '从左边缩放图片预览' },
  { edge: 'top-left', label: '从左上角缩放图片预览' },
  { edge: 'top-right', label: '从右上角缩放图片预览' },
  { edge: 'bottom-right', label: '从右下角缩放图片预览' },
  { edge: 'bottom-left', label: '从左下角缩放图片预览' }
]

const previewStyle = computed(() => {
  return {
    left: `${figurePreviewRect.value.left}px`,
    top: `${figurePreviewRect.value.top}px`,
    width: `${figurePreviewRect.value.width}px`,
    height: `${figurePreviewRect.value.height}px`
  }
})

const previewCaption = computed(() => {
  if (!activeFigure.value) return '暂无图注'

  if (translationVisible.value) {
    const translated = figureCaptionTranslationMap.value[activeFigure.value.id]
    if (translated) return translated
  }

  return activeFigure.value.caption || activeFigure.value.subCaption || '暂无图注'
})

const currentFigureIndex = computed(() => {
  if (!activeFigure.value) {
    return -1
  }

  return currentPaperFigures.value.findIndex((figure) => figure.id === activeFigure.value?.id)
})

const canSwitchFigures = computed(() => {
  return currentPaperFigures.value.length > 1 && currentFigureIndex.value >= 0
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
    paperReaderStore.setFigurePreviewRect(buildResizedRect(resizeState.value, event))
  }
}

function buildResizedRect(state: ResizeState, event: MouseEvent): PaperFigurePreviewRect {
  const deltaX = event.clientX - state.clientX
  const deltaY = event.clientY - state.clientY
  const edge = state.edge
  const rect = { ...state.rect }
  const right = state.rect.left + state.rect.width
  const bottom = state.rect.top + state.rect.height

  if (edge.includes('left')) {
    rect.width = Math.max(state.rect.width - deltaX, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
    rect.left = right - rect.width
  }

  if (edge.includes('right')) {
    rect.width = Math.max(state.rect.width + deltaX, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
  }

  if (edge.includes('top')) {
    rect.height = Math.max(state.rect.height - deltaY, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
    rect.top = bottom - rect.height
  }

  if (edge.includes('bottom')) {
    rect.height = Math.max(state.rect.height + deltaY, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
  }

  return rect
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

function handleResizeStart(event: MouseEvent, edge: ResizeEdge): void {
  if (event.button !== 0) {
    return
  }

  resizeState.value = {
    clientX: event.clientX,
    clientY: event.clientY,
    edge,
    rect: { ...figurePreviewRect.value }
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
  if (!activeFigure.value) {
    return
  }

  if (event.key === 'Escape') {
    if (figurePreviewPinned.value) {
      return
    }

    paperReaderStore.closeFigurePreview()
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    switchFigure(-1)
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    switchFigure(1)
  }
}

function togglePinned(): void {
  paperReaderStore.setFigurePreviewPinned(!figurePreviewPinned.value)
}

function switchFigure(step: number): void {
  if (!canSwitchFigures.value) {
    return
  }

  const nextIndex =
    (currentFigureIndex.value + step + currentPaperFigures.value.length) %
    currentPaperFigures.value.length
  const nextFigure = currentPaperFigures.value[nextIndex]
  if (!nextFigure) {
    return
  }

  paperReaderStore.openFigurePreview(nextFigure)
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
      :class="styles['paper-figure-preview']"
      :style="previewStyle"
      role="dialog"
      aria-label="论文图片预览"
    >
      <div :class="styles['paper-figure-preview__header']" @mousedown.prevent="handleDragStart">
        <div :class="styles['paper-figure-preview__meta']">
          <div :class="styles['paper-figure-preview__title']">论文图片预览</div>
        </div>

        <div :class="styles['paper-figure-preview__actions']" @mousedown.stop>
          <button
            :class="[
              'sm-icon-button',
              styles['paper-figure-preview__action'],
              { 'is-active': figurePreviewPinned }
            ]"
            :title="figurePreviewPinned ? '取消钉住' : '钉住预览窗'"
            :aria-label="figurePreviewPinned ? '取消钉住' : '钉住预览窗'"
            type="button"
            @click.stop="togglePinned"
          >
            <SvgIcon :name="figurePreviewPinned ? 'pin-filled' : 'pin'" :size="14" />
          </button>

          <button
            :class="['sm-icon-button', styles['paper-figure-preview__action']]"
            title="关闭"
            aria-label="关闭图片预览"
            type="button"
            @click.stop="paperReaderStore.closeFigurePreview()"
          >
            <SvgIcon name="close" :size="14" />
          </button>
        </div>
      </div>

      <div :class="styles['paper-figure-preview__body']">
        <div :class="styles['paper-figure-preview__image-shell']">
          <img
            :src="activeFigure.imagePath"
            :alt="previewCaption"
            :class="styles['paper-figure-preview__image']"
            @load="handleImageLoad"
          />

          <div v-if="canSwitchFigures" :class="styles['paper-figure-preview__nav']" @mousedown.stop>
            <button
              :class="['sm-icon-button', styles['paper-figure-preview__nav-button']]"
              type="button"
              title="上一张"
              aria-label="查看上一张图片"
              @click.stop="switchFigure(-1)"
            >
              <SvgIcon name="arrow-left" :size="14" />
            </button>

            <button
              :class="['sm-icon-button', styles['paper-figure-preview__nav-button']]"
              type="button"
              title="下一张"
              aria-label="查看下一张图片"
              @click.stop="switchFigure(1)"
            >
              <SvgIcon name="arrow-right" :size="14" />
            </button>
          </div>
        </div>

        <div :class="styles['paper-figure-preview__caption']">
          {{ previewCaption }}
        </div>
      </div>

      <button
        v-for="handle in resizeHandles"
        :key="handle.edge"
        :class="[
          styles['paper-figure-preview__resize'],
          styles[`paper-figure-preview__resize--${handle.edge}`]
        ]"
        type="button"
        tabindex="-1"
        :aria-label="handle.label"
        @mousedown.prevent.stop="handleResizeStart($event, handle.edge)"
      />
    </div>
  </Teleport>
</template>
