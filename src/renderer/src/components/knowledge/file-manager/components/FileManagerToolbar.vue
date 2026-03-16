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
    <div class="search-box">
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        placeholder="搜索文件..."
        @input="searchFiles(searchQuery)"
      />
      <span class="search-icon">🔍</span>
    </div>
    <div class="file-stats">共 {{ filteredFiles.length }} 个文件</div>
  </div>
</template>

<style scoped>
.file-manager-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  gap: 16px;
  border-bottom: 1px solid var(--theme-border);
}

.search-box {
  position: relative;
  flex: 1;
  max-width: 300px;
}

.search-input {
  width: 100%;
  padding: 8px 12px 8px 36px;
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

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  opacity: 0.5;
}

.file-stats {
  font-size: 13px;
  color: var(--theme-text-secondary);
}
</style>
