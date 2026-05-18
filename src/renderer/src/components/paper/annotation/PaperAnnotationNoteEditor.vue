<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { NoteEditorState } from '../composables/usePaperAnnotationComposer'
import styles from './PaperAnnotationNoteEditor.module.css'

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
  (e: 'close'): void
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
    :class="styles['paper-annotation-note-editor']"
    :style="{
      left: `${state.x}px`,
      top: `${state.y}px`
    }"
    @mousedown.stop
  >
    <div
      :class="styles['paper-annotation-note-editor__header']"
      @mousedown.prevent="handleDragStart"
    >
      <div :class="styles['paper-annotation-note-editor__title']">
        {{ isExistingNote ? '编辑笔记' : '记录笔记' }}
      </div>
      <button
        :class="styles['paper-annotation-note-editor__close']"
        type="button"
        aria-label="关闭笔记编辑器"
        @mousedown.stop
        @click="emit('close')"
      >
        ✕
      </button>
    </div>
    <div :class="styles['paper-annotation-note-editor__selection']">
      {{ state.draft.selectedText }}
    </div>
    <textarea
      :value="comment"
      :class="styles['paper-annotation-note-editor__input']"
      rows="7"
      placeholder="写下这段内容的笔记..."
      @input="emit('update:comment', ($event.target as HTMLTextAreaElement).value)"
    />
    <div :class="styles['paper-annotation-note-editor__actions']">
      <div :class="styles['paper-annotation-note-editor__color-chip']" />
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
    <p v-if="error" :class="styles['paper-annotation-note-editor__error']">
      {{ error }}
    </p>
    <p
      v-if="state.draft.viewKind === 'translation'"
      :class="styles['paper-annotation-note-editor__hint']"
    >
      该笔记只显示在当前译文中；如果之后删除译文，对应标注也会一起删除。
    </p>
  </div>
</template>
