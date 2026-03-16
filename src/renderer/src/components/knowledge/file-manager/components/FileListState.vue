<script setup lang="ts">
/**
 * 文件列表状态组件
 * 显示加载中、空列表等状态
 */
import { storeToRefs } from 'pinia'
import { useFileStore } from '@renderer/stores'

const fileStore = useFileStore()
const { loading, searchQuery, filteredFiles } = storeToRefs(fileStore)
</script>

<template>
  <div class="file-list-container">
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else-if="filteredFiles.length === 0" class="empty-state">
      <p v-if="searchQuery">未找到匹配的文件</p>
      <p v-else>暂无文件，请上传文件</p>
    </div>

    <!-- 文件列表插槽 -->
    <div v-else class="file-grid">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.file-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

/* 加载状态 */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-state p {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 0;
}

/* Spinner */
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

/* 滚动条样式 */
.file-list-container::-webkit-scrollbar {
  width: 6px;
}

.file-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.file-list-container::-webkit-scrollbar-thumb {
  background-color: var(--theme-border);
  border-radius: 3px;
}

.file-list-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--theme-text-secondary);
}
</style>
