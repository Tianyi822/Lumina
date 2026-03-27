<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { ExportFormat, Message } from '@renderer/types'
import { EXPORT_FORMAT_OPTIONS } from '@renderer/utils/messageExport'

const props = defineProps<{
  message: Message
  isExporting?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select-format', format: ExportFormat): void
  (e: 'open-ppt-config'): void
}>()

/**
 * 处理关闭
 */
function handleClose(): void {
  if (!props.isExporting) {
    emit('close')
  }
}

/**
 * 处理格式选择
 */
function handleSelectFormat(format: ExportFormat): void {
  if (!props.isExporting) {
    // PPT 格式需要打开配置对话框
    if (format === 'ppt') {
      emit('open-ppt-config')
    } else {
      emit('select-format', format)
    }
  }
}

/**
 * 处理键盘快捷键
 */
function handleKeydown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase()

  if (key === 'escape') {
    handleClose()
    return
  }

  const shortcuts: Record<string, ExportFormat> = {
    '1': 'markdown',
    m: 'markdown',
    '2': 'word',
    w: 'word',
    '3': 'pdf',
    '4': 'txt',
    t: 'txt',
    '5': 'ppt'
  }

  const selectedFormat = shortcuts[key]
  if (selectedFormat) {
    handleSelectFormat(selectedFormat)
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="export-dialog-overlay" @click.self="handleClose">
    <div class="export-dialog" role="dialog" aria-modal="true" :aria-busy="isExporting">
      <div class="export-dialog-header">
        <div>
          <h3 class="export-dialog-title">导出内容</h3>
          <p class="export-dialog-subtitle">选择导出格式后会直接下载对应文件</p>
        </div>
        <button
          type="button"
          class="btn export-dialog-close"
          :disabled="isExporting"
          @click="handleClose"
        >
          关闭
        </button>
      </div>

      <div class="export-preview">
        {{ message.content.slice(0, 140) }}{{ message.content.length > 140 ? '...' : '' }}
      </div>

      <div class="export-option-grid">
        <button
          v-for="option in EXPORT_FORMAT_OPTIONS"
          :key="option.value"
          type="button"
          class="export-option-card"
          :disabled="isExporting"
          @click="handleSelectFormat(option.value)"
        >
          <div class="export-option-top">
            <span class="export-option-label">{{ option.label }}</span>
            <span class="export-option-shortcut">{{ option.shortcut }}</span>
          </div>
          <span class="export-option-desc">{{ option.description }}</span>
        </button>
      </div>

      <div class="export-dialog-footer">
        {{ isExporting ? '正在生成文档，请稍候...' : '支持快捷键 1/5 或 M/W/P/T/PPT 选择格式' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(11, 11, 12, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: calc(54px + env(safe-area-inset-top, 0px)) 24px 24px;
  overflow: hidden;
}

.export-dialog {
  width: min(560px, calc(100vw - 48px));
  max-height: min(620px, calc(100vh - 96px - env(safe-area-inset-top, 0px)));
  background: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.export-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
  flex-shrink: 0;
}

.export-dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin: 0;
  letter-spacing: -0.01em;
}

.export-dialog-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.export-dialog-close {
  min-width: 64px;
  height: 32px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  border-radius: 999px;
  transition:
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.export-dialog-close:hover:not(:disabled) {
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-text-primary);
}

.export-dialog-close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.export-preview {
  margin: 20px 20px 0;
  padding: 14px 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.export-option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 20px;
}

.export-option-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-primary);
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.export-option-card:hover:not(:disabled) {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
}

.export-option-card:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.export-option-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.export-option-label {
  font-size: 14px;
  font-weight: 600;
}

.export-option-shortcut {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(142, 149, 217, 0.22);
  background: rgba(142, 149, 217, 0.08);
  color: var(--sm-color-accent-hover);
  font-size: 10px;
  font-weight: 600;
}

.export-option-desc {
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.export-dialog-footer {
  padding: 0 20px 20px;
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
  text-align: center;
}

@media (max-width: 640px) {
  .export-dialog-overlay {
    padding: 12px;
  }

  .export-dialog {
    width: 100%;
    height: auto;
    max-height: 90vh;
  }

  .export-option-grid {
    grid-template-columns: 1fr;
    padding: 16px;
  }
}
</style>
