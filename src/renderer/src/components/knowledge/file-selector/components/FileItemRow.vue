<script setup lang="ts">
/**
 * 文件行项组件
 * 显示单个文件的选择状态和信息
 */
import type { FileItem } from '@renderer/types'
import { useFileStore } from '@renderer/stores'
import { FileIcon } from '../../shared/components'
import { getFileSourceClass, getFileSourceLabel, getFileSubtitle } from '../../utils/fileSource'
import styles from './FileItemRow.module.css'

defineProps<{
  /** 文件信息 */
  file: FileItem
  /** 是否被选中 */
  selected?: boolean
  /** 是否正在关联 */
  linking?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', fileId: string): void
}>()

const fileStore = useFileStore()
</script>

<template>
  <div
    :class="[styles['file-item'], { [styles.selected]: selected, [styles.linking]: linking }]"
    @click="emit('toggle', file.id)"
  >
    <div :class="styles['file-checkbox']">
      <input type="checkbox" :checked="selected" @click.stop @change="emit('toggle', file.id)" />
    </div>

    <FileIcon :file-type="file.fileType" :size="24" />

    <div :class="styles['file-details']">
      <div :class="styles['file-title-line']">
        <div :class="styles['file-name']">{{ file.name }}</div>
        <span :class="[styles['source-badge'], styles[getFileSourceClass(file)]]">
          {{ getFileSourceLabel(file) }}
        </span>
      </div>
      <div :class="styles['file-subtitle']" :title="getFileSubtitle(file)">
        {{ getFileSubtitle(file) }}
      </div>
      <div :class="styles['file-meta']">
        <span class="badge">{{ file.fileType.toUpperCase() }}</span>
        <span>{{ fileStore.formatFileSize(file.size) }}</span>
        <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
      </div>
    </div>

    <div v-if="linking" :class="styles['linking-indicator']">
      <span class="sm-spinner"></span>
    </div>
  </div>
</template>
