<script setup lang="ts">
/**
 * 文件卡片组件
 * 显示单个文件的信息和操作按钮
 */
import type { FileItem } from '@renderer/types'
import { useFileStore } from '@renderer/stores'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { FileIcon } from '../../shared/components'
import {
  canDeleteFile,
  getFileSourceClass,
  getFileSourceLabel,
  getFileSubtitle
} from '../../utils/fileSource'
import styles from './FileCard.module.css'

defineProps<{
  /** 文件信息 */
  file: FileItem
  /** 是否正在删除 */
  isDeleting?: boolean
}>()

const emit = defineEmits<{
  (e: 'delete', file: FileItem): void
  (e: 'preview', file: FileItem): void
}>()

const fileStore = useFileStore()

function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return fileName.substring(0, lastDotIndex)
  }
  return fileName
}
</script>

<template>
  <div :class="styles['file-row']" @click="emit('preview', file)">
    <div :class="styles['file-row__main']">
      <div :class="styles['file-row__title-line']">
        <FileIcon :class="styles['file-row__icon']" :file-type="file.fileType" :size="14" />
        <div :class="styles['file-name']" :title="file.name">
          {{ getFileNameWithoutExtension(file.name) }}
        </div>
        <span :class="[styles['source-badge'], styles[getFileSourceClass(file)]]">
          {{ getFileSourceLabel(file) }}
        </span>
        <div :class="styles['file-meta']">
          <span :class="['badge', styles['file-type-badge']]">{{
            file.fileType.toUpperCase()
          }}</span>
          <span>{{ fileStore.formatFileSize(file.size) }}</span>
          <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
        </div>
        <div v-if="file.usedByKBIds.length > 0" :class="styles['usage-badge']">使用中</div>
        <button
          v-if="canDeleteFile(file)"
          :class="styles['delete-btn']"
          :disabled="isDeleting"
          :title="file.usedByKBIds.length > 0 ? '文件被知识库使用，删除需谨慎' : '删除文件'"
          @click.stop="emit('delete', file)"
        >
          <span v-if="isDeleting" class="sm-spinner"></span>
          <SvgIcon v-else name="trash" :size="14" />
        </button>
      </div>
      <div :class="styles['file-subtitle']" :title="getFileSubtitle(file)">
        {{ getFileSubtitle(file) }}
      </div>
    </div>
  </div>
</template>
