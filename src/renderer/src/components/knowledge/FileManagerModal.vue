<script setup lang="ts">
/**
 * 文件管理模态框
 * 管理文件的上传、删除等操作
 */
import { computed, onMounted, ref } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useFileStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { FileItem } from '@renderer/types'
import { FileUploadZone } from './shared/components'
import type { UploadResult } from './shared/composables/useFileUpload'
import {
  FileManagerHeader,
  FileManagerToolbar,
  FileCard,
  FileListState,
  ConfirmDeleteDialog
} from './file-manager'
import { useFileDelete } from './file-manager/composables/useFileDelete'
import FilePreviewDialog from './FilePreviewDialog.vue'
import styles from './FileManagerModal.module.css'

const emit = defineEmits<{
  (e: 'close'): void
}>()

// 文件管理
const fileStore = useZustandStore(useFileStore)
const filteredFiles = computed(() => fileStore.filteredFiles())

const notify = useNotification()

// 删除逻辑
const {
  deletingFileId,
  showConfirmDialog,
  fileToDelete,
  handleDeleteClick,
  performDelete,
  cancelDelete
} = useFileDelete()

// 上传完成回调
function handleUploadComplete(result: UploadResult): void {
  const messages: string[] = []

  if (result.duplicates.length > 0) {
    const names = result.duplicates.map((f) => f.name).join(', ')
    messages.push(`以下文件已存在，已自动关联：${names}`)
  }

  if (result.errors.length > 0) {
    notify.error('文件上传', `部分文件上传失败：${result.errors.join('；')}`, { source: 'file' })
    return
  }

  if (messages.length > 0) {
    notify.info('文件上传', messages.join(' '), { source: 'file' })
  }
}

// 文件预览
const previewFile = ref<FileItem | null>(null)
const showPreview = ref(false)

function handlePreview(file: FileItem): void {
  previewFile.value = file
  showPreview.value = true
}

function handleClosePreview(): void {
  showPreview.value = false
  setTimeout(() => {
    previewFile.value = null
  }, 300)
}

// 生命周期
onMounted(async () => {
  await fileStore.loadFiles()
})
</script>

<template>
  <div :class="['sm-modal__overlay', styles['file-manager-overlay']]" @click.self="emit('close')">
    <div :class="['sm-modal__surface', styles['file-manager-container']]">
      <FileManagerHeader @close="emit('close')" />

      <FileManagerToolbar />

      <div :class="styles['drop-zone-wrapper']">
        <FileUploadZone @upload-complete="handleUploadComplete" />
      </div>

      <FileListState>
        <FileCard
          v-for="file in filteredFiles"
          :key="file.id"
          :file="file"
          :is-deleting="deletingFileId === file.id"
          @delete="handleDeleteClick"
          @preview="handlePreview"
        />
      </FileListState>
    </div>

    <ConfirmDeleteDialog
      :show="showConfirmDialog"
      :file="fileToDelete"
      :is-deleting="!!deletingFileId"
      @confirm="performDelete"
      @cancel="cancelDelete"
    />

    <FilePreviewDialog :visible="showPreview" :file="previewFile" @close="handleClosePreview" />
  </div>
</template>
