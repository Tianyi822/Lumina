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
const { loadFiles, linkFileToKB } = fileStore

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
async function handleUploadComplete(result: UploadResult): Promise<void> {
  // 上传成功后，自动关联到当前知识库
  const newlyUploaded: FileItem[] = []
  for (const file of result.uploaded) {
    const linkResult = await linkFileToKB(file.id, props.kbId)
    if (linkResult.success) {
      newlyUploaded.push(file)
    }
  }

  // 处理重复文件：询问是否关联
  for (const file of result.duplicates) {
    if (!props.linkedFileIds.includes(file.id)) {
      const linkResult = await linkFileToKB(file.id, props.kbId)
      if (linkResult.success) {
        newlyUploaded.push(file)
      }
    }
  }

  if (newlyUploaded.length > 0) {
    emit('filesLinked', newlyUploaded)
  }

  // 上传完成后切换到已有文件标签页
  if (newlyUploaded.length > 0 || result.duplicates.length > 0) {
    activeTab.value = 'existing'
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
