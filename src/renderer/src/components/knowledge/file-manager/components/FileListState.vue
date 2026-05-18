<script setup lang="ts">
/**
 * 文件列表状态组件
 * 显示加载中、空列表等状态
 */
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useFileStore } from '@renderer/stores'

const fileStore = useZustandStore(useFileStore)
</script>

<template>
  <div class="file-list-container">
    <div v-if="fileStore.loading" class="loading-state">
      <span class="sm-spinner sm-spinner--large"></span>
      <p>加载中...</p>
    </div>

    <div v-else-if="fileStore.filteredFiles.length === 0" class="empty-state sm-empty">
      <p v-if="fileStore.searchQuery">未找到匹配的文件</p>
      <p v-else>暂无文件，请上传文件</p>
    </div>

    <div v-else class="file-list">
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

.file-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
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

  .file-list {
    gap: var(--sm-space-2);
  }
}
</style>
