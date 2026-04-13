<script setup lang="ts">
import type { PaperAnnotationColorKey } from '@shared/types/paper'
import type { SelectionActionMenuState } from '../composables/usePaperAnnotationComposer'

defineProps<{
  state: SelectionActionMenuState
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'open-highlight-palette'): void
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
    <div class="paper-annotation-selection-menu__title">
      {{ state.draft.mode === 'rebind' ? '重新绑定标记' : '添加到标注' }}
    </div>
    <div class="paper-annotation-selection-menu__selection">
      {{ state.draft.selectedText }}
    </div>

    <div v-if="state.showHighlightPalette" class="paper-annotation-selection-menu__palette">
      <button
        v-for="colorKey in highlightColorOptions"
        :key="colorKey"
        class="paper-annotation-selection-menu__color-chip"
        :class="`paper-annotation-selection-menu__color-chip--${colorKey}`"
        type="button"
        :title="colorKey"
        @click="emit('create-highlight', colorKey)"
      />
    </div>

    <div v-else class="paper-annotation-selection-menu__actions">
      <button
        class="sm-button sm-button--secondary paper-annotation-selection-menu__button"
        type="button"
        @click="emit('open-highlight-palette')"
      >
        标记
      </button>
      <button
        class="sm-button sm-button--primary paper-annotation-selection-menu__button"
        type="button"
        @click="emit('open-note-editor')"
      >
        记录笔记
      </button>
    </div>

    <button class="paper-annotation-selection-menu__cancel" type="button" @click="emit('cancel')">
      {{ state.draft.mode === 'rebind' ? '取消重绑' : '取消' }}
    </button>
    <p v-if="error" class="paper-annotation-selection-menu__error">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.paper-annotation-selection-menu {
  position: fixed;
  width: min(248px, calc(100vw - 32px));
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  box-shadow:
    0 24px 56px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
  z-index: 20;
}

.paper-annotation-selection-menu__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-annotation-selection-menu__selection {
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.paper-annotation-selection-menu__actions,
.paper-annotation-selection-menu__palette {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.paper-annotation-selection-menu__button {
  flex: 1;
  justify-content: center;
}

.paper-annotation-selection-menu__palette {
  justify-content: center;
}

.paper-annotation-selection-menu__color-chip {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 1px solid var(--sm-color-border-default);
  cursor: pointer;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease;
}

.paper-annotation-selection-menu__color-chip:hover {
  transform: translateY(-1px);
  border-color: var(--sm-color-border-strong);
}

.paper-annotation-selection-menu__color-chip--blue {
  background: var(--sm-color-paper-annotation-blue);
}

.paper-annotation-selection-menu__color-chip--yellow {
  background: var(--sm-color-paper-annotation-yellow);
}

.paper-annotation-selection-menu__color-chip--orange {
  background: var(--sm-color-paper-annotation-orange);
}

.paper-annotation-selection-menu__cancel {
  margin-top: 10px;
  border: none;
  background: transparent;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.paper-annotation-selection-menu__error {
  margin: 8px 0 0;
  color: var(--sm-color-status-danger);
  font-size: 12px;
}
</style>
