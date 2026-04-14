<script setup lang="ts">
import type { PaperAnnotation, PaperAnnotationColorKey } from '@shared/types/paper'
import type { AnnotationHoverPopoverState } from '../composables/usePaperAnnotationComposer'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

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
    class="paper-annotation-hover-popover"
    :style="{
      left: `${state.x}px`,
      top: `${state.y}px`
    }"
    @mousedown.stop
  >
    <div class="paper-annotation-hover-popover__row">
      <template v-if="isHighlight(annotation)">
        <button
          v-for="colorKey in highlightColorOptions"
          :key="`hover-${colorKey}`"
          class="paper-annotation-hover-popover__color-btn"
          :class="{ 'is-active': annotation.colorKey === colorKey }"
          type="button"
          :title="colorKey"
          @click="emit('update-color', colorKey)"
        >
          <span
            class="paper-annotation-hover-popover__dot"
            :class="`paper-annotation-hover-popover__dot--${colorKey}`"
          />
        </button>

        <div class="paper-annotation-hover-popover__divider-v" />
      </template>

      <button
        class="paper-annotation-hover-popover__action-btn"
        type="button"
        @click="emit('delete')"
      >
        {{ isHighlight(annotation) ? '删除标记' : '删除笔记' }}
      </button>

      <div class="paper-annotation-hover-popover__divider-v" />

      <button
        class="paper-annotation-hover-popover__action-btn"
        type="button"
        @click="emit('open-note-editor')"
      >
        <SvgIcon
          v-if="isHighlight(annotation)"
          class="paper-annotation-hover-popover__icon"
          name="note"
          :size="14"
        />
        <span>{{ isHighlight(annotation) ? '添加笔记' : '编辑笔记' }}</span>
      </button>
    </div>

    <p v-if="error" class="paper-annotation-hover-popover__error">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.paper-annotation-hover-popover {
  position: fixed;
  min-width: auto;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  box-shadow:
    0 16px 40px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
  z-index: 20;
  overflow: hidden;
}

.paper-annotation-hover-popover__row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.paper-annotation-hover-popover__color-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.paper-annotation-hover-popover__color-btn:hover {
  background: var(--sm-color-surface-hover);
}

.paper-annotation-hover-popover__color-btn.is-active {
  background: var(--sm-color-surface-selected);
}

.paper-annotation-hover-popover__dot {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--sm-color-border-default);
  flex-shrink: 0;
}

.paper-annotation-hover-popover__dot--blue {
  background: var(--sm-color-paper-annotation-blue);
}

.paper-annotation-hover-popover__dot--yellow {
  background: var(--sm-color-paper-annotation-yellow);
}

.paper-annotation-hover-popover__dot--orange {
  background: var(--sm-color-paper-annotation-orange);
}

.paper-annotation-hover-popover__dot--green {
  background: var(--sm-color-paper-annotation-green);
}

.paper-annotation-hover-popover__action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sm-color-text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease;
  white-space: nowrap;
}

.paper-annotation-hover-popover__action-btn:hover {
  background: var(--sm-color-surface-hover);
}

.paper-annotation-hover-popover__divider-v {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--sm-color-border-subtle);
}

.paper-annotation-hover-popover__icon {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}

.paper-annotation-hover-popover__error {
  margin: 6px 0 0;
  padding: 0 6px;
  color: var(--sm-color-status-danger);
  font-size: 12px;
}
</style>
