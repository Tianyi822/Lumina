<script setup lang="ts">
import { ref } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const props = defineProps<{
  modelValue: string
  isSending?: boolean
  isDragging?: boolean
  hasAttachments?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'keydown', event: KeyboardEvent): void
  (e: 'paste', event: ClipboardEvent): void
  (e: 'dragover', event: DragEvent): void
  (e: 'dragleave', event: DragEvent): void
  (e: 'drop', event: DragEvent): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)

function focus(): void {
  textareaRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div
    class="paper-chat-input__textarea-wrapper"
    @dragover="emit('dragover', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop="emit('drop', $event)"
  >
    <textarea
      ref="textareaRef"
      :value="props.modelValue"
      class="input paper-chat-input__textarea"
      :class="{
        'has-attachments': props.hasAttachments,
        'is-dragging': props.isDragging,
        'is-sending': props.isSending
      }"
      :placeholder="props.placeholder"
      rows="3"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @keydown="emit('keydown', $event)"
      @paste="emit('paste', $event)"
    ></textarea>

    <div v-if="props.isDragging" class="paper-chat-input__drag-overlay">
      <div class="paper-chat-input__drag-hint">
        <SvgIcon name="attachment" :size="48" />
        <p>释放文件以上传（支持文档和图片）</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paper-chat-input__textarea-wrapper {
  position: relative;
}

.paper-chat-input__textarea {
  width: 100%;
  min-height: 104px;
  resize: vertical;
  font-family: var(--sm-font-sans);
  line-height: 1.5;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  color: var(--sm-color-text-primary);
  padding: 14px 16px;
  font-size: 13px;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.paper-chat-input__textarea:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.paper-chat-input__textarea:focus {
  background: var(--sm-color-surface-1);
  border-color: var(--sm-color-border-accent);
  outline: 1px solid var(--sm-color-border-accent);
  outline-offset: 0;
}

.paper-chat-input__textarea:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.paper-chat-input__textarea.is-sending {
  border-color: var(--sm-color-border-default);
}

.paper-chat-input__textarea.is-sending:focus {
  border-color: var(--sm-color-border-accent);
}

.paper-chat-input__textarea.is-dragging {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-accent-08);
}

.paper-chat-input__drag-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sm-color-accent-10);
  border: 1px dashed var(--sm-color-border-accent);
  border-radius: var(--sm-radius-md);
  pointer-events: none;
  z-index: 10;
}

.paper-chat-input__drag-hint {
  text-align: center;
  color: var(--sm-color-accent-hover);
}

.paper-chat-input__drag-hint svg {
  margin-bottom: 8px;
}

.paper-chat-input__drag-hint p {
  font-size: 14px;
  font-weight: 500;
}
</style>
