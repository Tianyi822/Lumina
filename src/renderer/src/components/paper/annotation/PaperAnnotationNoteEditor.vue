<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { NoteEditorState } from '../composables/usePaperAnnotationComposer'

interface PointerState {
  clientX: number
  clientY: number
}

defineProps<{
  state: NoteEditorState
  comment: string
  isExistingNote: boolean
  canUpdate: boolean
  saving: boolean
  error: string | null
}>()

const emit = defineEmits<{
  (e: 'update:comment', value: string): void
  (e: 'save'): void
  (e: 'update-note'): void
  (e: 'delete-note'): void
  (e: 'cancel'): void
  (e: 'move', delta: { x: number; y: number }): void
}>()

const dragState = ref<PointerState | null>(null)

function stopDrag(): void {
  dragState.value = null
  window.removeEventListener('mousemove', handleDragMove)
  window.removeEventListener('mouseup', handleDragEnd)
}

function handleDragMove(event: MouseEvent): void {
  if (!dragState.value) {
    return
  }

  emit('move', {
    x: event.clientX - dragState.value.clientX,
    y: event.clientY - dragState.value.clientY
  })
  dragState.value = {
    clientX: event.clientX,
    clientY: event.clientY
  }
}

function handleDragEnd(): void {
  stopDrag()
}

function handleDragStart(event: MouseEvent): void {
  if (event.button !== 0) {
    return
  }

  dragState.value = {
    clientX: event.clientX,
    clientY: event.clientY
  }
  window.addEventListener('mousemove', handleDragMove)
  window.addEventListener('mouseup', handleDragEnd)
}

onBeforeUnmount(() => {
  stopDrag()
})
</script>

<template>
  <div
    class="paper-annotation-note-editor"
    :style="{
      left: `${state.x}px`,
      top: `${state.y}px`
    }"
    @mousedown.stop
  >
    <div class="paper-annotation-note-editor__header" @mousedown.prevent="handleDragStart">
      <div class="paper-annotation-note-editor__title">
        {{
          isExistingNote ? '编辑笔记' : state.draft.mode === 'rebind' ? '重新绑定笔记' : '记录笔记'
        }}
      </div>
    </div>
    <div class="paper-annotation-note-editor__selection">
      {{ state.draft.selectedText }}
    </div>
    <textarea
      :value="comment"
      class="paper-annotation-note-editor__input"
      rows="7"
      placeholder="写下这段内容的笔记..."
      @input="emit('update:comment', ($event.target as HTMLTextAreaElement).value)"
    />
    <div class="paper-annotation-note-editor__actions">
      <div class="paper-annotation-note-editor__color-chip" />
      <template v-if="isExistingNote">
        <button
          class="sm-button sm-button--danger"
          type="button"
          :disabled="saving"
          @click="emit('delete-note')"
        >
          删除笔记
        </button>
        <button
          class="sm-button sm-button--primary"
          type="button"
          :disabled="saving || !canUpdate"
          @click="emit('update-note')"
        >
          {{ saving ? '更新中...' : '更新笔记' }}
        </button>
      </template>
      <template v-else>
        <button class="sm-button sm-button--secondary" type="button" @click="emit('cancel')">
          {{ state.draft.mode === 'rebind' ? '取消重绑' : '取消' }}
        </button>
        <button
          class="sm-button sm-button--primary"
          type="button"
          :disabled="saving"
          @click="emit('save')"
        >
          {{ saving ? '保存中...' : '保存笔记' }}
        </button>
      </template>
    </div>
    <p v-if="error" class="paper-annotation-note-editor__error">
      {{ error }}
    </p>
    <p
      v-if="!isExistingNote && state.draft.mode === 'rebind'"
      class="paper-annotation-note-editor__hint"
    >
      保存后会保留原始创建时间，只更新定位与笔记内容。
    </p>
    <p v-if="state.draft.viewKind === 'translation'" class="paper-annotation-note-editor__hint">
      该笔记只显示在当前译文中；如果之后删除译文，对应标注也会一起删除。
    </p>
  </div>
</template>

<style scoped>
.paper-annotation-note-editor {
  position: fixed;
  width: min(420px, calc(100vw - 32px));
  min-height: min(320px, calc(100vh - 32px));
  max-height: calc(100vh - 32px);
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  box-shadow:
    0 24px 56px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
  z-index: 20;
  overflow: auto;
}

.paper-annotation-note-editor__header {
  cursor: move;
  user-select: none;
}

.paper-annotation-note-editor__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-annotation-note-editor__selection {
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
  max-height: 104px;
  overflow: auto;
}

.paper-annotation-note-editor__input {
  width: 100%;
  min-height: 180px;
  margin-top: 12px;
  border-radius: 12px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
  padding: 12px;
  resize: vertical;
  font: inherit;
  box-sizing: border-box;
}

.paper-annotation-note-editor__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.paper-annotation-note-editor__color-chip {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--sm-color-paper-annotation-green);
  border: 1px solid var(--sm-color-border-default);
}

.paper-annotation-note-editor__error {
  margin: 8px 0 0;
  color: var(--sm-color-status-danger);
  font-size: 12px;
}

.paper-annotation-note-editor__hint {
  margin: 8px 0 0;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}
</style>
