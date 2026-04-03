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
      <span class="sm-spinner sm-spinner--large"></span>
      <p>加载中...</p>
    </div>

    <div v-else-if="filteredFiles.length === 0" class="empty-state sm-empty">
      <p v-if="searchQuery">未找到匹配的文件</p>
      <p v-else>暂无文件，请上传文件</p>
    </div>

    <div v-else class="file-grid">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.file-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--sm-space-5) var(--sm-space-5);
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--sm-space-4);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: var(--sm-space-6) var(--sm-space-4);
  gap: var(--sm-space-3);
  text-align: center;
}

.loading-state p,
.empty-state p {
  margin: 0;
  font-size: 14px;
  color: var(--sm-color-text-secondary);
}

.file-list-container::-webkit-scrollbar {
  width: var(--sm-scrollbar-size);
}

.file-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.file-list-container::-webkit-scrollbar-thumb {
  background-color: var(--sm-color-border-default);
  border-radius: 999px;
}

.file-list-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--sm-color-border-strong);
}

@media (max-width: 720px) {
  .file-list-container {
    padding: 0 var(--sm-space-4) var(--sm-space-4);
  }

  .file-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
