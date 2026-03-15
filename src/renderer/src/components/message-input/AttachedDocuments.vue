<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { getFileTypeIcon, getFileExtension } from '@renderer/utils/fileIcons'
import type { PendingDocument } from '@renderer/stores/documentUploadStore'
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
  <div v-if="props.documents.length > 0" class="pending-docs-list">
    <div v-for="(doc, index) in props.documents" :key="index" class="pending-doc-item">
      <SvgIcon
        class="pending-doc-icon"
        :name="getFileTypeIcon(doc.fileName).name"
        :size="16"
        :color="getFileTypeIcon(doc.fileName).color"
      />
      <div class="pending-doc-info">
        <span class="pending-doc-name" :title="doc.fileName">{{ doc.fileName }}</span>
        <span class="pending-doc-type">{{ getFileExtension(doc.fileName).toUpperCase() || 'FILE' }}</span>
        <span class="pending-doc-size">{{ formatFileSize(doc.fileSize) }}</span>
      </div>
      <button
        class="pending-doc-remove"
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
.pending-docs-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.pending-doc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.08) 0%, rgba(70, 170, 143, 0.03) 100%);
  border: 1px solid rgba(70, 170, 143, 0.2);
  border-radius: var(--theme-radius-sm, 6px);
  font-size: 12px;
  color: var(--theme-text);
  max-width: 280px;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.pending-doc-item:hover {
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.12) 0%, rgba(70, 170, 143, 0.05) 100%);
  border-color: rgba(70, 170, 143, 0.3);
}

.pending-doc-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.pending-doc-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pending-doc-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  font-size: 12px;
  line-height: 1.4;
}

.pending-doc-type {
  font-size: 10px;
  font-weight: 600;
  color: var(--theme-accent);
  opacity: 0.8;
  line-height: 1.3;
}

.pending-doc-size {
  font-size: 10px;
  color: var(--theme-text-tertiary);
  opacity: 0.7;
  line-height: 1.3;
}

.pending-doc-remove {
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
  color: var(--theme-text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.pending-doc-remove:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--theme-danger);
}

.pending-doc-remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
