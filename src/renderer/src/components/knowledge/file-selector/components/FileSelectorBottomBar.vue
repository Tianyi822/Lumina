<script setup lang="ts">
/**
 * 文件选择器底部操作栏组件
 */
import type { FileItem } from '@renderer/types'
import styles from './FileSelectorBottomBar.module.css'

defineProps<{
  /** 选中的文件数量 */
  selectedCount: number
  /** 是否有选中的文件 */
  hasSelectedFiles: boolean
  /** 可选的文件列表 */
  availableFiles: FileItem[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectAll'): void
  (e: 'deselectAll'): void
  (e: 'linkSelected'): void
}>()
</script>

<template>
  <div :class="styles['bottom-bar']">
    <div :class="styles['left-actions']">
      <span :class="styles['selection-count']">已选择 {{ selectedCount }} 个文件</span>
      <div :class="styles['selection-actions']">
        <button :class="styles['btn-link']" @click="emit('selectAll')">全选</button>
        <button :class="styles['btn-link']" @click="emit('deselectAll')">取消全选</button>
      </div>
    </div>
    <div :class="styles['actions']">
      <button class="sm-button sm-button--secondary" @click="emit('close')">取消</button>
      <button
        class="sm-button sm-button--primary"
        :disabled="!hasSelectedFiles"
        @click="emit('linkSelected')"
      >
        添加到知识库
      </button>
    </div>
  </div>
</template>
