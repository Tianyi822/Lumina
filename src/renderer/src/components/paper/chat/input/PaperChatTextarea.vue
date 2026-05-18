<script setup lang="ts">
import { ref } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import styles from './PaperChatTextarea.module.css'

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
    :class="styles['paper-chat-input__textarea-wrapper']"
    @dragover="emit('dragover', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop="emit('drop', $event)"
  >
    <textarea
      ref="textareaRef"
      :value="props.modelValue"
      :class="[
        'input',
        styles['paper-chat-input__textarea'],
        {
          'has-attachments': props.hasAttachments,
          'is-dragging': props.isDragging,
          'is-sending': props.isSending
        }
      ]"
      :placeholder="props.placeholder"
      rows="3"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      @keydown="emit('keydown', $event)"
      @paste="emit('paste', $event)"
    ></textarea>

    <div v-if="props.isDragging" :class="styles['paper-chat-input__drag-overlay']">
      <div :class="styles['paper-chat-input__drag-hint']">
        <SvgIcon name="attachment" :size="48" />
        <p>释放文件以上传（支持文档和图片）</p>
      </div>
    </div>
  </div>
</template>
