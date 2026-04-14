<script setup lang="ts">
import type { PaperAnnotationColorKey } from '@shared/types/paper'
import type { SelectionActionMenuState } from '../composables/usePaperAnnotationComposer'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

defineProps<{
  state: SelectionActionMenuState
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'create-highlight', colorKey: PaperAnnotationColorKey): void
  (e: 'open-note-editor'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div
    class="paper-annotation-selection-menu"
    :style="{
      left: `${state.x}px`,
      top: `${state.y}px`
    }"
    @mousedown.prevent
  >
    <div class="paper-annotation-selection-menu__row">
      <button
        v-for="colorKey in highlightColorOptions"
        :key="colorKey"
        class="paper-annotation-selection-menu__color-btn"
        type="button"
        :title="colorKey"
        @click="emit('create-highlight', colorKey)"
      >
        <span
          class="paper-annotation-selection-menu__dot"
          :class="`paper-annotation-selection-menu__dot--${colorKey}`"
        />
      </button>

      <div class="paper-annotation-selection-menu__divider-v" />

      <button
        class="paper-annotation-selection-menu__note-btn"
        type="button"
        @click="emit('open-note-editor')"
      >
        <SvgIcon class="paper-annotation-selection-menu__icon" name="note" :size="14" />
        <span class="paper-annotation-selection-menu__label">记录笔记</span>
      </button>
    </div>

    <p v-if="error" class="paper-annotation-selection-menu__error">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.paper-annotation-selection-menu {
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

.paper-annotation-selection-menu__row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.paper-annotation-selection-menu__color-btn {
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

.paper-annotation-selection-menu__color-btn:hover {
  background: var(--sm-color-surface-hover);
}

.paper-annotation-selection-menu__dot {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--sm-color-border-default);
  flex-shrink: 0;
}

.paper-annotation-selection-menu__dot--blue {
  background: var(--sm-color-paper-annotation-blue);
}

.paper-annotation-selection-menu__dot--yellow {
  background: var(--sm-color-paper-annotation-yellow);
}

.paper-annotation-selection-menu__dot--orange {
  background: var(--sm-color-paper-annotation-orange);
}

.paper-annotation-selection-menu__dot--green {
  background: var(--sm-color-paper-annotation-green);
}

.paper-annotation-selection-menu__divider-v {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--sm-color-border-subtle);
}

.paper-annotation-selection-menu__note-btn {
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

.paper-annotation-selection-menu__note-btn:hover {
  background: var(--sm-color-surface-hover);
}

.paper-annotation-selection-menu__icon {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}

.paper-annotation-selection-menu__error {
  margin: 6px 0 0;
  padding: 0 6px;
  color: var(--sm-color-status-danger);
  font-size: 12px;
}
</style>
