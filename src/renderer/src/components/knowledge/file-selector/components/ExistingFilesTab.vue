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
import styles from './ExistingFilesTab.module.css'

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
  <div :class="styles['tab-content']">
    <div :class="styles['search-bar']">
      <div :class="styles['search-bar__copy']">
        <span :class="styles['search-bar__label']">文件资源池</span>
        <span :class="styles['search-bar__count']">{{ availableFiles.length }} 个可挂载文件</span>
      </div>
      <input
        :value="fileStore.searchQuery"
        type="text"
        :class="['sm-input', styles['search-input']]"
        placeholder="搜索文件..."
        @input="fileStore.searchFiles(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div :class="styles['file-list']">
      <div v-if="fileStore.loading" :class="styles['state-message']">
        <span class="sm-spinner sm-spinner--large"></span>
        <p>加载中...</p>
      </div>

      <div v-else-if="availableFiles.length === 0" :class="['sm-empty', styles['state-message']]">
        <p v-if="fileStore.searchQuery">未找到匹配的文件</p>
        <p v-else>没有可添加的文件，请先上传文件或切换到"上传新文件"标签页</p>
      </div>

      <div v-else :class="styles['file-items']">
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
