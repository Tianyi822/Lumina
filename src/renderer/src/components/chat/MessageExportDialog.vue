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
    emit('select-format', format)
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
    p: 'pdf',
    '4': 'txt',
    t: 'txt'
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
    <div class="export-dialog">
      <div class="export-dialog-header">
        <div>
          <h3 class="export-dialog-title">导出内容</h3>
          <p class="export-dialog-subtitle">选择导出格式后会直接下载对应文件</p>
        </div>
        <button class="export-dialog-close" :disabled="isExporting" @click="handleClose">
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
        {{ isExporting ? '正在生成文档，请稍候...' : '支持快捷键 1/2/3/4 或 M/W/P/T 选择格式' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.export-dialog {
  width: min(560px, 100%);
  border: 1px solid var(--theme-border);
  border-radius: calc(var(--theme-radius-lg) + 2px);
  background: linear-gradient(
    180deg,
    var(--glass-white-027, rgba(255, 255, 255, 0.027)) 0%,
    var(--theme-bg-secondary) 100%
  );
  box-shadow:
    0 22px 60px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 var(--glass-white-1, rgba(255, 255, 255, 0.1));
  overflow: hidden;
}

.export-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
}

.export-dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--theme-text);
}

.export-dialog-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.export-dialog-close {
  padding: 8px 12px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg);
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background-color 0.2s ease;
}

.export-dialog-close:hover:not(:disabled) {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

.export-dialog-close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.export-preview {
  margin: 0 22px;
  padding: 14px 16px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: var(--theme-bg);
  color: var(--theme-text-secondary);
  font-size: 13px;
  line-height: 1.65;
  word-break: break-word;
}

.export-option-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 18px 22px 14px;
}

.export-option-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-lg);
  background: var(--theme-bg);
  color: var(--theme-text);
  cursor: pointer;
  text-align: left;
  transition:
    transform 0.18s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

.export-option-card:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--theme-accent) 40%, var(--theme-border));
  background: var(--theme-bg-hover);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
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
  font-size: 15px;
  font-weight: 700;
}

.export-option-shortcut {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  color: var(--theme-accent);
  font-size: 11px;
  font-weight: 700;
}

.export-option-desc {
  font-size: 12px;
  line-height: 1.55;
  color: var(--theme-text-secondary);
}

.export-dialog-footer {
  padding: 0 22px 20px;
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

@media (max-width: 640px) {
  .export-dialog-overlay {
    padding: 16px;
  }

  .export-option-grid {
    grid-template-columns: 1fr;
  }
}
</style>
