<script setup lang="ts">
/**
 * 已有文件标签页组件
 * 显示已有文件列表供选择
 */
import { computed } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
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

const fileStore = useZustandStore(useFileStore)

// 可选择的文件列表（排除已关联的文件）
const availableFiles = computed(() => {
  const linkedSet = new Set(props.linkedFileIds)
  let result = fileStore.files.filter((f) => !linkedSet.has(f.id))

  if (fileStore.searchQuery.trim()) {
    const query = fileStore.searchQuery.toLowerCase()
    result = result.filter((file) => {
      const searchableText = [
        file.name,
        file.sourceKind,
        file.origin?.paperName,
        file.origin?.displayName,
        file.origin?.summary
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return searchableText.includes(query)
    })
  }

  return result
})

const hasSelectedFiles = computed(() => props.selectedFileIds.size > 0)
const selectedCount = computed(() => props.selectedFileIds.size)
</script>

<template>
  <div class="tab-content">
    <div class="search-bar">
      <div class="search-bar__copy">
        <span class="search-bar__label">文件资源池</span>
        <span class="search-bar__count">{{ availableFiles.length }} 个可挂载文件</span>
      </div>
      <input
        :value="fileStore.searchQuery"
        type="text"
        class="sm-input search-input"
        placeholder="搜索文件..."
        @input="fileStore.searchFiles(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="file-list">
      <div v-if="fileStore.loading" class="state-message">
        <span class="sm-spinner sm-spinner--large"></span>
        <p>加载中...</p>
      </div>

      <div v-else-if="availableFiles.length === 0" class="state-message sm-empty">
        <p v-if="fileStore.searchQuery">未找到匹配的文件</p>
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
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.search-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: 0 var(--sm-space-5) var(--sm-space-4);
}

.search-bar__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-bar__label {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.search-bar__count {
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}

.search-input {
  flex: 1;
  max-width: 320px;
}

.file-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 var(--sm-space-4) var(--sm-space-4);
}

.file-items {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.state-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: var(--sm-space-6) var(--sm-space-4);
  gap: var(--sm-space-3);
  text-align: center;
  color: var(--sm-color-text-secondary);
}

.state-message p {
  margin: 0;
  font-size: 14px;
}

.file-list::-webkit-scrollbar {
  width: var(--sm-scrollbar-size);
}

.file-list::-webkit-scrollbar-track {
  background: transparent;
}

.file-list::-webkit-scrollbar-thumb {
  background-color: var(--sm-color-border-default);
  border-radius: 999px;
}

.file-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--sm-color-border-strong);
}

@media (max-width: 720px) {
  .search-bar {
    flex-direction: column;
    align-items: stretch;
    padding: 0 var(--sm-space-4) var(--sm-space-4);
  }

  .search-input {
    max-width: none;
  }

  .file-list {
    padding: 0 var(--sm-space-3) var(--sm-space-4);
  }
}
</style>
