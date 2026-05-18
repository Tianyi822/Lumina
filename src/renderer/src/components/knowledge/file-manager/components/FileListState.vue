<script setup lang="ts">
/**
 * 文件列表状态组件
 * 显示加载中、空列表等状态
 */
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useFileStore } from '@renderer/stores'
import styles from './FileListState.module.css'

const fileStore = useZustandStore(useFileStore)
</script>

<template>
  <div :class="styles['file-list-container']">
    <div v-if="fileStore.loading" :class="styles['loading-state']">
      <span class="sm-spinner sm-spinner--large"></span>
      <p>加载中...</p>
    </div>

    <div
      v-else-if="fileStore.filteredFiles.length === 0"
      :class="['sm-empty', styles['empty-state']]"
    >
      <p v-if="fileStore.searchQuery">未找到匹配的文件</p>
      <p v-else>暂无文件，请上传文件</p>
    </div>

    <div v-else :class="styles['file-list']">
      <slot></slot>
    </div>
  </div>
</template>
