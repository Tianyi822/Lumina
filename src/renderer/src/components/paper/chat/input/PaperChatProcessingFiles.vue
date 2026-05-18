<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { ProcessingFile } from '@renderer/stores/paperChatDocumentUploadStore'
import styles from './PaperChatProcessingFiles.module.css'

const props = defineProps<{
  files: ProcessingFile[]
}>()
</script>

<template>
  <div v-if="props.files.length > 0" :class="styles['processing-files-list']">
    <div v-for="file in props.files" :key="file.tempId" :class="styles['processing-file-item']">
      <span v-if="file.status === 'uploading'" :class="[styles['processing-status'], 'uploading']">
        <SvgIcon :class="styles['status-icon']" name="spinner" :size="16" :spin="true" />
        上传中: {{ file.fileName }}
      </span>
      <span v-else-if="file.status === 'parsing'" :class="[styles['processing-status'], 'parsing']">
        <SvgIcon :class="styles['status-icon']" name="spinner" :size="16" :spin="true" />
        解析中: {{ file.fileName }}
      </span>
      <span
        v-else-if="file.status === 'completed'"
        :class="[styles['processing-status'], 'completed']"
      >
        完成: {{ file.fileName }}
      </span>
      <span v-else-if="file.status === 'failed'" :class="[styles['processing-status'], 'failed']">
        失败: {{ file.fileName }}
        <span v-if="file.error" :class="styles['processing-error']"> - {{ file.error }}</span>
      </span>
    </div>
  </div>
</template>
