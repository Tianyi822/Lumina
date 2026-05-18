<script setup lang="ts">
import type { PaperAnnotation, PaperAnnotationColorKey } from '@shared/types/paper'
import type { AnnotationHoverPopoverState } from '../composables/usePaperAnnotationComposer'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import styles from './PaperAnnotationHoverPopover.module.css'

defineProps<{
  state: AnnotationHoverPopoverState
  annotation: PaperAnnotation
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'delete'): void
  (e: 'open-note-editor'): void
  (e: 'update-color', colorKey: PaperAnnotationColorKey): void
}>()

const isHighlight = (annotation: PaperAnnotation): boolean => annotation.kind === 'highlight'
</script>

<template>
  <div
    :class="styles['paper-annotation-hover-popover']"
    :style="{
      left: `${state.x}px`,
      top: `${state.y}px`
    }"
    @mousedown.stop
  >
    <div :class="styles['paper-annotation-hover-popover__row']">
      <template v-if="isHighlight(annotation)">
        <button
          v-for="colorKey in highlightColorOptions"
          :key="`hover-${colorKey}`"
          :class="[
            styles['paper-annotation-hover-popover__color-btn'],
            { 'is-active': annotation.colorKey === colorKey }
          ]"
          type="button"
          :title="colorKey"
          @click="emit('update-color', colorKey)"
        >
          <span
            :class="[
              styles['paper-annotation-hover-popover__dot'],
              styles[`paper-annotation-hover-popover__dot--${colorKey}`]
            ]"
          />
        </button>

        <div :class="styles['paper-annotation-hover-popover__divider-v']" />
      </template>

      <button
        :class="styles['paper-annotation-hover-popover__action-btn']"
        type="button"
        @click="emit('delete')"
      >
        {{ isHighlight(annotation) ? '删除标记' : '删除笔记' }}
      </button>

      <div :class="styles['paper-annotation-hover-popover__divider-v']" />

      <button
        :class="styles['paper-annotation-hover-popover__action-btn']"
        type="button"
        @click="emit('open-note-editor')"
      >
        <SvgIcon
          v-if="isHighlight(annotation)"
          :class="styles['paper-annotation-hover-popover__icon']"
          name="note"
          :size="14"
        />
        <span>{{ isHighlight(annotation) ? '添加笔记' : '编辑笔记' }}</span>
      </button>
    </div>

    <p v-if="error" :class="styles['paper-annotation-hover-popover__error']">
      {{ error }}
    </p>
  </div>
</template>
