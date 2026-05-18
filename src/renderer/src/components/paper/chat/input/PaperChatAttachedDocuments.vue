<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { getFileTypeIcon, getFileExtension } from '@renderer/utils/fileIcons'
import type { PendingDocument } from '@renderer/stores/paperChatDocumentUploadStore'
import { formatFileSize } from './attachmentUtils'
import styles from './PaperChatAttachedDocuments.module.css'

const props = defineProps<{
  documents: PendingDocument[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'remove', index: number): void
}>()
</script>

<template>
  <div v-if="props.documents.length > 0" :class="styles['paper-chat-input__pending-documents']">
    <div
      v-for="(doc, index) in props.documents"
      :key="index"
      :class="styles['paper-chat-input__pending-document']"
    >
      <SvgIcon
        :class="styles['paper-chat-input__pending-document-icon']"
        :name="getFileTypeIcon(doc.fileName).name"
        :size="16"
        :color="getFileTypeIcon(doc.fileName).color"
      />
      <div :class="styles['paper-chat-input__pending-document-info']">
        <span :class="styles['paper-chat-input__pending-document-name']" :title="doc.fileName">{{
          doc.fileName
        }}</span>
        <span :class="styles['paper-chat-input__pending-document-type']">{{
          getFileExtension(doc.fileName).toUpperCase() || 'FILE'
        }}</span>
        <span :class="styles['paper-chat-input__pending-document-size']">{{
          formatFileSize(doc.fileSize)
        }}</span>
      </div>
      <button
        :class="styles['paper-chat-input__pending-document-remove']"
        title="移除"
        :disabled="props.disabled"
        @click="emit('remove', index)"
      >
        <SvgIcon name="close" :size="12" />
      </button>
    </div>
  </div>
</template>
