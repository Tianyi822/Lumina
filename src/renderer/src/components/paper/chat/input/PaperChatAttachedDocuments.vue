<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { getFileTypeIcon, getFileExtension } from '@renderer/utils/fileIcons'
import type { PendingDocument } from '@renderer/stores/paperChatDocumentUploadStore'
import { formatFileSize } from './attachmentUtils'

const props = defineProps<{
  documents: PendingDocument[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove', index: number): void
}>()
</script>

<template>
  <div v-if="props.documents.length > 0" class="paper-chat-input__pending-documents">
    <div
      v-for="(doc, index) in props.documents"
      :key="index"
      class="paper-chat-input__pending-document"
    >
      <SvgIcon
        class="paper-chat-input__pending-document-icon"
        :name="getFileTypeIcon(doc.fileName).name"
        :size="16"
        :color="getFileTypeIcon(doc.fileName).color"
      />
      <div class="paper-chat-input__pending-document-info">
        <span class="paper-chat-input__pending-document-name" :title="doc.fileName">{{
          doc.fileName
        }}</span>
        <span class="paper-chat-input__pending-document-type">{{
          getFileExtension(doc.fileName).toUpperCase() || 'FILE'
        }}</span>
        <span class="paper-chat-input__pending-document-size">{{
          formatFileSize(doc.fileSize)
        }}</span>
      </div>
      <button
        class="paper-chat-input__pending-document-remove"
        title="移除"
        :disabled="props.disabled"
        @click="emit('remove', index)"
      >
        <SvgIcon name="close" :size="12" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.paper-chat-input__pending-documents {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
}

.paper-chat-input__pending-document {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  font-size: 12px;
  color: var(--sm-color-text-primary);
  max-width: 280px;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.paper-chat-input__pending-document:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.paper-chat-input__pending-document-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.paper-chat-input__pending-document-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.paper-chat-input__pending-document-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  font-size: 12px;
  line-height: 1.4;
}

.paper-chat-input__pending-document-type {
  font-size: 10px;
  font-weight: 600;
  color: var(--sm-color-accent-hover);
  opacity: 0.8;
  line-height: 1.3;
}

.paper-chat-input__pending-document-size {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  opacity: 0.7;
  line-height: 1.3;
}

.paper-chat-input__pending-document-remove {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--sm-color-text-tertiary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.paper-chat-input__pending-document-remove:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--sm-color-status-danger);
}

.paper-chat-input__pending-document-remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
