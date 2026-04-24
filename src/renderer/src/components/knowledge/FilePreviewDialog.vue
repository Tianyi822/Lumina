<script setup lang="ts">
/**
 * 文件预览对话框
 * 展示从文件中提取的文本内容
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { FileItem, FilePreviewData } from '@renderer/types'
import { FileIcon } from './shared'
import { useFileStore } from '@renderer/stores'
import {
  canOpenFileExternally,
  getFileSourceClass,
  getFileSourceLabel,
  getFileSubtitle
} from './utils/fileSource'

const props = defineProps<{
  visible: boolean
  file: FileItem | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const fileStore = useFileStore()
const loading = ref(false)
const error = ref('')
const previewData = ref<FilePreviewData | null>(null)

// 加载文件预览内容
async function loadPreview(): Promise<void> {
  if (!props.file) return

  loading.value = true
  error.value = ''
  previewData.value = null

  const result = await window.api.file.preview(props.file.id)
  if (result.success && result.data) {
    previewData.value = result.data
  } else {
    error.value = result.error || '未知错误'
  }

  loading.value = false
}

// 使用系统默认程序打开文件
async function handleOpenExternal(): Promise<void> {
  if (!props.file) return
  const result = await window.api.file.openExternal(props.file.id)
  if (!result.success) {
    error.value = result.error || '打开文件失败'
  }
}

function handleClose(): void {
  emit('close')
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.visible) {
    handleClose()
  }
}

// 当文件变化时加载预览
watch(
  () => [props.visible, props.file?.id],
  ([visible]) => {
    if (visible) {
      loadPreview()
    }
  }
)

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && file" class="file-preview-overlay" @click.self="handleClose">
      <div class="file-preview-dialog" role="dialog" aria-modal="true">
        <div class="file-preview-header">
          <div class="file-preview-meta">
            <div class="file-preview-title">
              <FileIcon :file-type="file.fileType" :size="18" />
              <span class="file-preview-name">{{ file.name }}</span>
            </div>
            <div class="file-preview-info">
              <span :class="['file-preview-badge', getFileSourceClass(file)]">
                {{ getFileSourceLabel(file) }}
              </span>
              <span class="file-preview-badge">{{ file.fileType.toUpperCase() }}</span>
              <span>{{ fileStore.formatFileSize(file.size) }}</span>
              <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
            </div>
            <div class="file-preview-subtitle">{{ getFileSubtitle(file) }}</div>
          </div>
          <div class="file-preview-actions">
            <button
              v-if="canOpenFileExternally(file)"
              type="button"
              class="preview-action-btn"
              @click="handleOpenExternal"
            >
              外部打开
            </button>
            <button type="button" class="preview-action-btn" @click="handleClose">关闭</button>
          </div>
        </div>

        <div class="file-preview-body">
          <!-- 加载状态 -->
          <div v-if="loading" class="file-preview-loading">
            <span class="sm-spinner sm-spinner--large"></span>
            <span>正在加载文件内容...</span>
          </div>

          <!-- 错误状态 -->
          <div v-else-if="error" class="file-preview-error">
            <div class="error-title">文件预览失败</div>
            <div class="error-text">{{ error }}</div>
          </div>

          <!-- 内容显示 -->
          <div v-else-if="previewData" class="file-preview-content-wrapper">
            <div v-if="previewData.isTruncated" class="file-preview-notice">
              文件内容较长，已截断显示。如需查看完整内容，请点击"外部打开"使用系统程序查看。
            </div>
            <pre class="file-preview-content">{{ previewData.content }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.file-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(11, 11, 12, 0.82);
}

.file-preview-dialog {
  width: min(980px, calc(100vw - 48px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
}

.file-preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
}

.file-preview-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.file-preview-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-preview-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  word-break: break-word;
}

.file-preview-info {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.file-preview-subtitle {
  max-width: 720px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-tertiary);
}

.file-preview-badge {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--sm-color-accent-12);
  font-size: 11px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.file-preview-badge.source-paper_file,
.file-preview-badge.source-paper_note {
  border: 1px solid var(--sm-color-accent-28);
  background: var(--sm-color-accent-08);
  color: var(--sm-color-accent-hover);
}

.file-preview-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.preview-action-btn {
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.preview-action-btn:hover {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-primary);
}

.file-preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 22px 22px;
}

.file-preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  gap: var(--sm-space-3);
  color: var(--sm-color-text-secondary);
  font-size: 13px;
}

.file-preview-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  text-align: center;
  gap: 10px;
}

.error-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.error-text {
  max-width: 480px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.file-preview-content-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-preview-notice {
  padding: 10px 14px;
  border: 1px solid var(--sm-color-accent-22);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-accent-06);
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.file-preview-content {
  margin: 0;
  padding: 16px;
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  font-size: 13px;
  line-height: 1.7;
  color: var(--sm-color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--sm-font-mono);
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

/* 滚动条样式 */
.file-preview-content::-webkit-scrollbar,
.file-preview-body::-webkit-scrollbar {
  width: var(--sm-scrollbar-size);
}

.file-preview-content::-webkit-scrollbar-track,
.file-preview-body::-webkit-scrollbar-track {
  background: transparent;
}

.file-preview-content::-webkit-scrollbar-thumb,
.file-preview-body::-webkit-scrollbar-thumb {
  background-color: var(--sm-color-border-default);
  border-radius: 999px;
}

@media (max-width: 768px) {
  .file-preview-overlay {
    padding: 12px;
  }

  .file-preview-dialog {
    width: 100%;
    max-height: calc(100vh - 24px);
  }

  .file-preview-header {
    flex-direction: column;
    padding-left: 14px;
    padding-right: 14px;
  }

  .file-preview-body {
    padding: 0 14px 14px;
  }

  .file-preview-actions {
    align-self: flex-end;
  }
}
</style>
