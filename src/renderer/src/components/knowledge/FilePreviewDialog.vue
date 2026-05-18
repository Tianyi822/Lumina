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
import styles from './FilePreviewDialog.module.css'

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
    <div v-if="visible && file" :class="styles['file-preview-overlay']" @click.self="handleClose">
      <div :class="styles['file-preview-dialog']" role="dialog" aria-modal="true">
        <div :class="styles['file-preview-header']">
          <div :class="styles['file-preview-meta']">
            <div :class="styles['file-preview-title']">
              <FileIcon :file-type="file.fileType" :size="18" />
              <span :class="styles['file-preview-name']">{{ file.name }}</span>
            </div>
            <div :class="styles['file-preview-info']">
              <span :class="[styles['file-preview-badge'], styles[getFileSourceClass(file)]]">
                {{ getFileSourceLabel(file) }}
              </span>
              <span :class="styles['file-preview-badge']">{{ file.fileType.toUpperCase() }}</span>
              <span>{{ fileStore.formatFileSize(file.size) }}</span>
              <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
            </div>
            <div :class="styles['file-preview-subtitle']">{{ getFileSubtitle(file) }}</div>
          </div>
          <div :class="styles['file-preview-actions']">
            <button
              v-if="canOpenFileExternally(file)"
              type="button"
              :class="styles['preview-action-btn']"
              @click="handleOpenExternal"
            >
              外部打开
            </button>
            <button type="button" :class="styles['preview-action-btn']" @click="handleClose">
              关闭
            </button>
          </div>
        </div>

        <div :class="styles['file-preview-body']">
          <!-- 加载状态 -->
          <div v-if="loading" :class="styles['file-preview-loading']">
            <span class="sm-spinner sm-spinner--large"></span>
            <span>正在加载文件内容...</span>
          </div>

          <!-- 错误状态 -->
          <div v-else-if="error" :class="styles['file-preview-error']">
            <div :class="styles['error-title']">文件预览失败</div>
            <div :class="styles['error-text']">{{ error }}</div>
          </div>

          <!-- 内容显示 -->
          <div v-else-if="previewData" :class="styles['file-preview-content-wrapper']">
            <div v-if="previewData.isTruncated" :class="styles['file-preview-notice']">
              文件内容较长，已截断显示。如需查看完整内容，请点击"外部打开"使用系统程序查看。
            </div>
            <pre :class="styles['file-preview-content']">{{ previewData.content }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
