<script setup lang="ts">
/**
 * 删除确认对话框组件
 */
import type { FileItem } from '@renderer/types'

defineProps<{
  /** 是否显示对话框 */
  show: boolean
  /** 待删除的文件 */
  file: FileItem | null
  /** 是否正在删除 */
  isDeleting?: boolean
  /** 错误信息 */
  error?: string
}>()

const emit = defineEmits<{
  (e: 'confirm', forceDelete: boolean): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div v-if="show" class="confirm-dialog-overlay">
    <div class="confirm-dialog">
      <div class="confirm-dialog-header">
        <h3>⚠️ 确认删除</h3>
      </div>
      <div class="confirm-dialog-body">
        <p v-if="file">
          文件 "<strong>{{ file.name }}</strong
          >" 正在被 <strong>{{ file.usedByKBIds.length }}</strong> 个知识库使用。
        </p>
        <p>删除此文件将从所有关联的知识库中移除。此操作不可撤销。</p>
        <p v-if="error" class="error-message">{{ error }}</p>
      </div>
      <div class="confirm-dialog-actions">
        <button class="btn" @click="emit('cancel')">取消</button>
        <button class="btn btn-danger" :disabled="isDeleting" @click="emit('confirm', true)">
          <span v-if="isDeleting" class="spinner-small"></span>
          <span v-else>强制删除</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  backdrop-filter: blur(4px);
}

.confirm-dialog {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  box-shadow: var(--theme-shadow);
}

.confirm-dialog-header {
  padding: 20px 20px 0;
}

.confirm-dialog-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.confirm-dialog-body {
  padding: 16px 20px;
  font-size: 14px;
  color: var(--theme-text-secondary);
  line-height: 1.6;
}

.confirm-dialog-body p {
  margin: 0 0 8px 0;
}

.confirm-dialog-body p:last-child {
  margin-bottom: 0;
}

.error-message {
  color: var(--theme-danger);
  font-size: 13px;
  margin-top: 8px;
}

.confirm-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 20px 20px;
}

/* 按钮样式 */
.btn {
  padding: 8px 16px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background-color: var(--theme-bg-hover);
}

.btn-danger {
  background-color: var(--theme-danger);
  border-color: var(--theme-danger);
  color: white;
}

.btn-danger:hover {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner-small {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--theme-border);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
