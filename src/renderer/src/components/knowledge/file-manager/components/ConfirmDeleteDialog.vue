<script setup lang="ts">
/**
 * 删除确认对话框组件
 */
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { FileItem } from '@renderer/types'
import styles from './ConfirmDeleteDialog.module.css'

defineProps<{
  /** 是否显示对话框 */
  show: boolean
  /** 待删除的文件 */
  file: FileItem | null
  /** 是否正在删除 */
  isDeleting?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm', forceDelete: boolean): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div v-if="show" :class="['sm-modal__overlay', styles['confirm-dialog-overlay']]">
    <div :class="['sm-modal__surface', styles['confirm-dialog']]">
      <div :class="styles['confirm-dialog-header']">
        <div :class="styles['confirm-dialog-title']">
          <SvgIcon name="warning" :size="20" />
          <h3>确认删除文件</h3>
        </div>
        <p :class="styles['confirm-dialog-subtitle']">此操作会同时影响已关联的知识库。</p>
      </div>
      <div :class="styles['confirm-dialog-body']">
        <p v-if="file">
          文件 "<strong>{{ file.name }}</strong
          >" 正在被 <strong>{{ file.usedByKBIds.length }}</strong> 个知识库使用。
        </p>
        <p>删除此文件将从所有关联的知识库中移除。此操作不可撤销。</p>
      </div>
      <div :class="styles['confirm-dialog-actions']">
        <button class="sm-button sm-button--secondary" @click="emit('cancel')">取消</button>
        <button
          class="sm-button sm-button--danger"
          :disabled="isDeleting"
          @click="emit('confirm', true)"
        >
          <span v-if="isDeleting" class="sm-spinner"></span>
          <span v-else>强制删除</span>
        </button>
      </div>
    </div>
  </div>
</template>
