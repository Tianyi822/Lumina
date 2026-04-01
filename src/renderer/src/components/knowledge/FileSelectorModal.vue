<script setup lang="ts">
/**
 * 文件选择模态框
 * 从已有文件选择或上传新文件到知识库
 */
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import type { UploadResult } from './shared/composables/useFileUpload'
import { FileSelectorHeader, FileSelectorTabs, ExistingFilesTab, UploadTab } from './file-selector'
import { useFileSelection } from './file-selector/composables/useFileSelection'

const props = defineProps<{
  kbId: string
  linkedFileIds: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'filesLinked', files: FileItem[]): void
}>()

// 标签页
type TabType = 'existing' | 'upload'
const activeTab = ref<TabType>('existing')

// 文件管理
const fileStore = useFileStore()
const { files } = storeToRefs(fileStore)
const { loadFiles } = fileStore

// 文件选择逻辑
const {
  selectedFileIds,
  linkingFileIds,
  toggleSelection,
  selectAll,
  deselectAll,
  linkSelectedFiles
} = useFileSelection(files, props.kbId)

// 处理选择切换
function handleToggle(fileId: string): void {
  toggleSelection(fileId)
}

// 处理全选
function handleSelectAll(availableFiles: FileItem[]): void {
  selectAll(availableFiles)
}

// 处理关联选中文件
async function handleLinkSelected(): Promise<void> {
  const linkedFiles = await linkSelectedFiles()
  if (linkedFiles.length > 0) {
    emit('filesLinked', linkedFiles)
  }
}

// 处理上传完成
function handleUploadComplete(result: UploadResult): void {
  // useFileUpload 已在 autoLinkToKB 模式下完成关联，直接通知父组件更新 UI
  const newFiles = [...result.uploaded, ...result.duplicates]
  if (newFiles.length > 0) {
    emit('filesLinked', newFiles)
  }
}

// 生命周期
onMounted(async () => {
  await loadFiles()
})
</script>

<template>
  <div class="sm-modal__overlay file-selector-overlay" @click.self="emit('close')">
    <div class="sm-modal__surface file-selector-container">
      <FileSelectorHeader @close="emit('close')" />

      <FileSelectorTabs v-model:active-tab="activeTab" />

      <ExistingFilesTab
        v-if="activeTab === 'existing'"
        :kb-id="kbId"
        :linked-file-ids="linkedFileIds"
        :selected-file-ids="selectedFileIds"
        :linking-file-ids="linkingFileIds"
        @toggle="handleToggle"
        @select-all="handleSelectAll"
        @deselect-all="deselectAll"
        @link-selected="handleLinkSelected"
        @close="emit('close')"
      />

      <UploadTab
        v-else
        :kb-id="kbId"
        @close="emit('close')"
        @upload-complete="handleUploadComplete"
      />
    </div>
  </div>
</template>

<style scoped>
.file-selector-overlay {
  z-index: 1000;
}

.file-selector-container {
  width: min(680px, calc(100vw - 72px));
  max-height: min(760px, calc(100vh - 104px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 720px) {
  .file-selector-container {
    width: calc(100vw - 32px);
  }
}
</style>
