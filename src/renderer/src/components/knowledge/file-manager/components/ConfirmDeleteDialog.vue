<script setup lang="ts">
/**
 * 删除确认对话框组件
 */
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { FileItem } from '@renderer/types'

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
  <div v-if="show" class="sm-modal__overlay confirm-dialog-overlay">
    <div class="sm-modal__surface confirm-dialog">
      <div class="confirm-dialog-header">
        <div class="confirm-dialog-title">
          <SvgIcon name="warning" :size="20" />
          <h3>确认删除文件</h3>
        </div>
        <p class="confirm-dialog-subtitle">此操作会同时影响已关联的知识库。</p>
      </div>
      <div class="confirm-dialog-body">
        <p v-if="file">
          文件 "<strong>{{ file.name }}</strong
          >" 正在被 <strong>{{ file.usedByKBIds.length }}</strong> 个知识库使用。
        </p>
        <p>删除此文件将从所有关联的知识库中移除。此操作不可撤销。</p>
      </div>
      <div class="confirm-dialog-actions">
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

<style scoped>
.confirm-dialog-overlay {
  z-index: 1100;
  padding-top: calc(var(--sm-titlebar-height) + 48px);
}

.confirm-dialog {
  width: 90%;
  max-width: 400px;
  overflow: hidden;
}

.confirm-dialog-header {
  padding: var(--sm-space-5) var(--sm-space-5) 0;
}

.confirm-dialog-title {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  margin-bottom: 8px;
  color: rgba(197, 161, 101, 0.92);
}

.confirm-dialog-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.confirm-dialog-subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.confirm-dialog-body {
  padding: var(--sm-space-4) var(--sm-space-5);
  font-size: 14px;
  color: var(--sm-color-text-secondary);
  line-height: 1.6;
}

.confirm-dialog-body p {
  margin: 0 0 8px 0;
}

.confirm-dialog-body p:last-child {
  margin-bottom: 0;
}

.error-message {
  margin-top: var(--sm-space-3);
}

.confirm-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--sm-space-3);
  padding: 0 var(--sm-space-5) var(--sm-space-5);
}
</style>
