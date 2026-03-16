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
  <div class="file-selector-overlay" @click.self="emit('close')">
    <div class="file-selector-container">
      <!-- 头部 -->
      <FileSelectorHeader @close="emit('close')" />

      <!-- 标签页 -->
      <FileSelectorTabs v-model:active-tab="activeTab" />

      <!-- 已有文件列表 -->
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

      <!-- 上传新文件 -->
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

.file-selector-container {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--theme-shadow);
}
</style>
