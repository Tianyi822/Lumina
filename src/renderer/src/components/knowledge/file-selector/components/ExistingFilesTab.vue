<script setup lang="ts">
/**
 * 已有文件标签页组件
 * 显示已有文件列表供选择
 */
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import FileItemRow from './FileItemRow.vue'
import FileSelectorBottomBar from './FileSelectorBottomBar.vue'

const props = defineProps<{
  /** 知识库 ID */
  kbId: string
  /** 已关联的文件 ID 列表 */
  linkedFileIds: string[]
  /** 选中的文件 ID 集合 */
  selectedFileIds: Set<string>
  /** 正在关联的文件 ID 集合 */
  linkingFileIds: Set<string>
}>()

const emit = defineEmits<{
  (e: 'toggle', fileId: string): void
  (e: 'selectAll', files: FileItem[]): void
  (e: 'deselectAll'): void
  (e: 'linkSelected'): void
  (e: 'close'): void
}>()

const fileStore = useFileStore()
const { loading, searchQuery, files } = storeToRefs(fileStore)
const { searchFiles } = fileStore

// 可选择的文件列表（排除已关联的文件）
const availableFiles = computed(() => {
  const linkedSet = new Set(props.linkedFileIds)
  let result = files.value.filter((f) => !linkedSet.has(f.id))

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((f) => f.name.toLowerCase().includes(query))
  }

  return result
})

const hasSelectedFiles = computed(() => props.selectedFileIds.size > 0)
const selectedCount = computed(() => props.selectedFileIds.size)
</script>

<template>
  <div class="tab-content">
    <!-- 搜索栏 -->
    <div class="search-bar">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="搜索文件..."
        @input="searchFiles(searchQuery)"
      />
    </div>

    <!-- 可选择的文件列表 -->
    <div class="file-list">
      <div v-if="loading" class="state-message">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>

      <div v-else-if="availableFiles.length === 0" class="state-message">
        <p v-if="searchQuery">未找到匹配的文件</p>
        <p v-else>没有可添加的文件，请先上传文件或切换到"上传新文件"标签页</p>
      </div>

      <div v-else class="file-items">
        <FileItemRow
          v-for="file in availableFiles"
          :key="file.id"
          :file="file"
          :selected="props.selectedFileIds.has(file.id)"
          :linking="props.linkingFileIds.has(file.id)"
          @toggle="emit('toggle', $event)"
        />
      </div>
    </div>

    <!-- 底部操作栏 -->
    <FileSelectorBottomBar
      :selected-count="selectedCount"
      :has-selected-files="hasSelectedFiles"
      :available-files="availableFiles"
      @select-all="emit('selectAll', availableFiles)"
      @deselect-all="emit('deselectAll')"
      @link-selected="emit('linkSelected')"
      @close="emit('close')"
    />
  </div>
</template>

<style scoped>
.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 400px;
}

.search-bar {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--theme-border);
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
  font-size: 14px;
  outline: none;
  transition: all 0.15s ease;
}

.search-input:focus {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 2px rgba(63, 185, 80, 0.1);
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.file-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--theme-text-secondary);
}

.state-message p {
  margin: 0;
  font-size: 14px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.file-list::-webkit-scrollbar {
  width: 6px;
}

.file-list::-webkit-scrollbar-track {
  background: transparent;
}

.file-list::-webkit-scrollbar-thumb {
  background-color: var(--theme-border);
  border-radius: 3px;
}

.file-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--theme-text-secondary);
}
</style>
