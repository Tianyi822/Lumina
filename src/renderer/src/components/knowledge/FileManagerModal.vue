<script setup lang="ts">
/**
 * 文件管理模态框
 * 管理文件的上传、删除等操作
 */
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFileStore } from '@renderer/stores'
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

const emit = defineEmits<{
  (e: 'close'): void
}>()

// 文件管理
const fileStore = useFileStore()
const { filteredFiles } = storeToRefs(fileStore)
const { loadFiles } = fileStore

// 删除逻辑
const {
  deletingFileId,
  showConfirmDialog,
  fileToDelete,
  deleteError,
  handleDeleteClick,
  performDelete,
  cancelDelete
} = useFileDelete()

// 上传完成回调
function handleUploadComplete(result: UploadResult): void {
  if (result.duplicates.length > 0) {
    const names = result.duplicates.map((f) => f.name).join(', ')
    alert(`以下文件已存在，已自动关联：${names}`)
  }

  if (result.errors.length > 0) {
    alert(`部分文件上传失败：\n${result.errors.join('\n')}`)
  }
}

// 生命周期
onMounted(async () => {
  await loadFiles()
})
</script>

<template>
  <div class="file-manager-overlay" @click.self="emit('close')">
    <div class="file-manager-container">
      <!-- 头部 -->
      <FileManagerHeader @close="emit('close')" />

      <!-- 工具栏 -->
      <FileManagerToolbar />

      <!-- 拖拽上传区域 -->
      <div class="drop-zone-wrapper">
        <FileUploadZone @upload-complete="handleUploadComplete" />
      </div>

      <!-- 文件列表 -->
      <FileListState>
        <FileCard
          v-for="file in filteredFiles"
          :key="file.id"
          :file="file"
          :is-deleting="deletingFileId === file.id"
          @delete="handleDeleteClick"
        />
      </FileListState>
    </div>

    <!-- 删除确认对话框 -->
    <ConfirmDeleteDialog
      :show="showConfirmDialog"
      :file="fileToDelete"
      :is-deleting="!!deletingFileId"
      :error="deleteError"
      @confirm="performDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<style scoped>
.file-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.file-manager-container {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--theme-shadow);
}

.drop-zone-wrapper {
  margin: 16px 24px;
}

.drop-zone-wrapper :deep(.upload-zone) {
  padding: 24px;
}
</style>
