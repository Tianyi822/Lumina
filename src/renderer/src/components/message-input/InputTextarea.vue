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
    class="input-wrapper"
    @dragover="emit('dragover', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop="emit('drop', $event)"
  >
    <textarea
      ref="textareaRef"
      :value="props.modelValue"
      class="input message-textarea"
      :class="{ 
        'has-docs': props.hasAttachments, 
        dragging: props.isDragging,
        'is-sending': props.isSending 
      }"
      :placeholder="props.placeholder"
      rows="3"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @keydown="emit('keydown', $event)"
    ></textarea>

    <div v-if="props.isDragging" class="drag-overlay">
      <div class="drag-hint">
        <SvgIcon name="attachment" :size="48" />
        <p>释放文件以上传（支持文档和图片）</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-wrapper {
  position: relative;
  margin-bottom: 12px;
}

.message-textarea {
  width: 100%;
  min-height: 80px;
  resize: vertical;
  font-family: var(--theme-font);
  line-height: 1.5;
  background:
    linear-gradient(
      135deg,
      var(--glass-white-02, rgba(255, 255, 255, 0.02)) 0%,
      var(--glass-white-01, rgba(255, 255, 255, 0.01)) 100%
    ),
    var(--glass-black-017, rgba(0, 0, 0, 0.017));
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid #46aa8f;
  border-radius: var(--theme-radius);
  color: var(--theme-text);
  padding: 12px 16px;
  font-size: 13px;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.message-textarea:hover {
  border-color: #3d9980;
}

.message-textarea:focus {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 3px rgba(70, 170, 143, 0.15);
  background:
    linear-gradient(
      135deg,
      var(--glass-white-027, rgba(255, 255, 255, 0.027)) 0%,
      var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
    ),
    var(--glass-black-02, rgba(0, 0, 0, 0.02));
  outline: none;
}

.message-textarea:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.message-textarea.is-sending {
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
}

.message-textarea.is-sending:focus {
  border-color: var(--theme-accent);
}

.message-textarea.dragging {
  border-color: var(--theme-accent);
  background: rgba(70, 170, 143, 0.05);
  box-shadow: 0 0 0 3px rgba(70, 170, 143, 0.2);
}

.drag-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(70, 170, 143, 0.1);
  border: 2px dashed var(--theme-accent);
  border-radius: var(--theme-radius);
  pointer-events: none;
  z-index: 10;
}

.drag-hint {
  text-align: center;
  color: var(--theme-accent);
}

.drag-hint svg {
  margin-bottom: 8px;
}

.drag-hint p {
  font-size: 14px;
  font-weight: 500;
}
</style>
