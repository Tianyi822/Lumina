<script setup lang="ts">
import type { PaperAnnotation, PaperAnnotationColorKey } from '@shared/types/paper'
import type { AnnotationHoverPopoverState } from '../composables/usePaperAnnotationComposer'

defineProps<{
  state: AnnotationHoverPopoverState
  annotation: PaperAnnotation
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  comment: string
  saving: boolean
  error: string | null
  statusLabel: string | null
  outdated: boolean
}>()

const emit = defineEmits<{
  (e: 'update:comment', value: string): void
  (e: 'update-color', colorKey: PaperAnnotationColorKey): void
  (e: 'save-note'): void
  (e: 'hide-translation'): void
  (e: 'update-translation'): void
  (e: 'dismiss-outdated'): void
  (e: 'delete'): void
  (e: 'pointer-enter'): void
  (e: 'pointer-leave'): void
  (e: 'focus-in'): void
  (e: 'focus-out', event: FocusEvent): void
}>()
</script>

<template>
  <div
    class="paper-annotation-hover-popover"
    :style="{
      left: `${state.x}px`,
      top: `${state.y}px`
    }"
    @mousedown.stop
    @pointerenter="emit('pointer-enter')"
    @pointerleave="emit('pointer-leave')"
    @focusin="emit('focus-in')"
    @focusout="emit('focus-out', $event)"
  >
    <div class="paper-annotation-hover-popover__header">
      <div class="paper-annotation-hover-popover__title">
        {{
          annotation.kind === 'highlight'
            ? '标记'
            : annotation.noteType === 'original_span'
              ? '原文笔记'
              : '译文笔记'
        }}
      </div>
      <span v-if="statusLabel" class="paper-annotation-hover-popover__status">
        {{ statusLabel }}
      </span>
    </div>

    <div class="paper-annotation-hover-popover__selection">
      {{ annotation.selectedTextSnapshot }}
    </div>

    <div v-if="annotation.kind === 'highlight'" class="paper-annotation-hover-popover__palette">
      <button
        v-for="colorKey in highlightColorOptions"
        :key="`hover-${colorKey}`"
        class="paper-annotation-hover-popover__color-chip"
        :class="[
          `paper-annotation-hover-popover__color-chip--${colorKey}`,
          { 'is-active': annotation.colorKey === colorKey }
        ]"
        type="button"
        :disabled="saving"
        @click="emit('update-color', colorKey)"
      />
    </div>

    <div v-else class="paper-annotation-hover-popover__note">
      <textarea
        :value="comment"
        class="paper-annotation-hover-popover__input"
        rows="5"
        placeholder="写下这段内容的笔记..."
        @input="emit('update:comment', ($event.target as HTMLTextAreaElement).value)"
      />
      <div class="paper-annotation-hover-popover__note-actions">
        <button
          class="sm-button sm-button--primary"
          type="button"
          :disabled="saving"
          @click="emit('save-note')"
        >
          {{ saving ? '保存中...' : '保存修改' }}
        </button>
      </div>
    </div>

    <div
      v-if="outdated"
      class="paper-annotation-hover-popover__banner paper-annotation-hover-popover__banner--info"
    >
      <div class="paper-annotation-hover-popover__banner-title">该标注基于旧版译文创建</div>
      <div class="paper-annotation-hover-popover__banner-text">
        当前译文版本已更新，若高亮位置有偏移，可以一键更新到当前译文，或手动重新选择。
      </div>
      <div class="paper-annotation-hover-popover__banner-actions">
        <button
          class="sm-button sm-button--secondary"
          type="button"
          @click="emit('hide-translation')"
        >
          查看原文位置
        </button>
        <button
          class="sm-button sm-button--primary"
          type="button"
          @click="emit('update-translation')"
        >
          更新到当前译文
        </button>
        <button
          class="sm-button sm-button--secondary"
          type="button"
          @click="emit('dismiss-outdated')"
        >
          忽略
        </button>
      </div>
    </div>

    <p v-if="error" class="paper-annotation-hover-popover__error">
      {{ error }}
    </p>

    <div class="paper-annotation-hover-popover__footer">
      <button class="paper-annotation-hover-popover__delete" type="button" @click="emit('delete')">
        删除标注
      </button>
    </div>
  </div>
</template>

<style scoped>
.paper-annotation-hover-popover {
  position: fixed;
  width: min(336px, calc(100vw - 32px));
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

.paper-annotation-hover-popover__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.paper-annotation-hover-popover__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-annotation-hover-popover__status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
  background: color-mix(in srgb, var(--sm-color-status-warning) 18%, transparent);
  color: var(--sm-color-text-secondary);
}

.paper-annotation-hover-popover__selection {
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.paper-annotation-hover-popover__palette {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 14px;
}

.paper-annotation-hover-popover__color-chip {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid var(--sm-color-border-default);
  cursor: pointer;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease;
}

.paper-annotation-hover-popover__color-chip:hover {
  transform: translateY(-1px);
  border-color: var(--sm-color-border-strong);
}

.paper-annotation-hover-popover__color-chip.is-active {
  border-color: var(--sm-color-border-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sm-color-accent-12) 84%, transparent);
}

.paper-annotation-hover-popover__color-chip--blue {
  background: var(--sm-color-paper-annotation-blue);
}

.paper-annotation-hover-popover__color-chip--yellow {
  background: var(--sm-color-paper-annotation-yellow);
}

.paper-annotation-hover-popover__color-chip--orange {
  background: var(--sm-color-paper-annotation-orange);
}

.paper-annotation-hover-popover__note {
  margin-top: 12px;
}

.paper-annotation-hover-popover__input {
  width: 100%;
  min-height: 120px;
  border-radius: 12px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
  padding: 12px;
  resize: vertical;
  font: inherit;
  box-sizing: border-box;
}

.paper-annotation-hover-popover__note-actions,
.paper-annotation-hover-popover__banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  margin-top: 10px;
}

.paper-annotation-hover-popover__banner {
  margin-top: 12px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 12px;
  padding: 12px;
  background: var(--sm-color-surface-2);
}

.paper-annotation-hover-popover__banner--info {
  border-color: var(--sm-color-border-accent);
  background: color-mix(in srgb, var(--sm-color-accent-08) 72%, var(--sm-color-surface-2));
}

.paper-annotation-hover-popover__banner-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-annotation-hover-popover__banner-text {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--sm-color-text-secondary);
}

.paper-annotation-hover-popover__error {
  margin: 8px 0 0;
  color: var(--sm-color-status-danger);
  font-size: 12px;
}

.paper-annotation-hover-popover__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.paper-annotation-hover-popover__delete {
  border: none;
  background: transparent;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
</style>
