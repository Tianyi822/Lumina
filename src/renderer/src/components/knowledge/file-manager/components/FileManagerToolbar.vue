<script setup lang="ts">
/**
 * 文件管理工具栏组件
 * 包含搜索框和文件统计
 */
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useFileStore } from '@renderer/stores'
import styles from './FileManagerToolbar.module.css'

const fileStore = useZustandStore(useFileStore)
</script>

<template>
  <div :class="styles['file-manager-toolbar']">
    <div :class="styles['toolbar-search']">
      <input
        :value="fileStore.searchQuery"
        type="text"
        :class="['sm-input', styles['search-input']]"
        placeholder="搜索文件..."
        @input="fileStore.searchFiles(($event.target as HTMLInputElement).value)"
      />
    </div>
    <div :class="styles['file-stats']">
      <span :class="styles['file-stats__label']">文件资源池</span>
      <span :class="styles['file-stats__count']">{{ fileStore.filteredFiles.length }} 个文件</span>
    </div>
  </div>
</template>
