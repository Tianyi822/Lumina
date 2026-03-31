<script setup lang="ts">
/**
 * 文件管理工具栏组件
 * 包含搜索框和文件统计
 */
import { storeToRefs } from 'pinia'
import { useFileStore } from '@renderer/stores'

const fileStore = useFileStore()
const { searchQuery, filteredFiles } = storeToRefs(fileStore)
const { searchFiles } = fileStore
</script>

<template>
  <div class="file-manager-toolbar">
    <div class="toolbar-search">
      <input
        v-model="searchQuery"
        type="text"
        class="sm-input search-input"
        placeholder="搜索文件..."
        @input="searchFiles(searchQuery)"
      />
    </div>
    <div class="file-stats">
      <span class="file-stats__label">文件资源池</span>
      <span class="file-stats__count">{{ filteredFiles.length }} 个文件</span>
    </div>
  </div>
</template>

<style scoped>
.file-manager-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: 0 var(--sm-space-5);
}

.toolbar-search {
  flex: 1;
  max-width: 360px;
}

.search-input {
  width: 100%;
}

.file-stats {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  white-space: nowrap;
}

.file-stats__label {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.file-stats__count {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

@media (max-width: 720px) {
  .file-manager-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-search {
    max-width: none;
  }
}
</style>
