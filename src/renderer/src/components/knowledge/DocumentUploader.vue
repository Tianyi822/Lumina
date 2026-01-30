<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'upload', files: File[]): void
  (e: 'cancel'): void
}>()

const isDragging = ref(false)
const selectedFiles = ref<File[]>([])

function handleDragOver(event: DragEvent): void {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent): void {
  event.preventDefault()
  isDragging.value = false
}

function handleDrop(event: DragEvent): void {
  event.preventDefault()
  isDragging.value = false

  const files = Array.from(event.dataTransfer?.files || [])
  addFiles(files)
}

function handleFileSelect(event: Event): void {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  addFiles(files)
}

function addFiles(files: File[]): void {
  // 过滤支持的文件类型
  const supportedTypes = ['.txt', '.md']
  const validFiles = files.filter((file) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    return supportedTypes.includes(ext)
  })

  if (validFiles.length < files.length) {
    alert('部分文件格式不支持。仅支持 .txt 和 .md 文件。')
  }

  selectedFiles.value.push(...validFiles)
}

function removeFile(index: number): void {
  selectedFiles.value.splice(index, 1)
}

function handleUpload(): void {
  if (selectedFiles.value.length === 0) return
  emit('upload', selectedFiles.value)
  selectedFiles.value = []
}

function handleCancel(): void {
  selectedFiles.value = []
  emit('cancel')
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="uploader-overlay" @click.self="handleCancel">
    <div class="uploader-container">
      <div class="uploader-header">
        <h2>上传文档</h2>
        <button class="close-btn" @click="handleCancel">✕</button>
      </div>

      <div class="uploader-content">
        <!-- 拖放区域 -->
        <div
          :class="['drop-zone', { dragging: isDragging }]"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
        >
          <div class="drop-icon">📄</div>
          <h3>拖放文件到这里</h3>
          <p>或者</p>
          <label class="btn select-btn">
            选择文件
            <input type="file" multiple accept=".txt,.md" @change="handleFileSelect" />
          </label>
          <p class="file-hint">支持 .txt 和 .md 文件，单个文件最大 10MB</p>
        </div>

        <!-- 文件列表 -->
        <div v-if="selectedFiles.length > 0" class="file-list">
          <div class="file-list-header">
            <h3>已选择 {{ selectedFiles.length }} 个文件</h3>
          </div>
          <div class="file-items">
            <div v-for="(file, index) in selectedFiles" :key="index" class="file-item">
              <div class="file-icon">
                {{ file.name.endsWith('.md') ? '📝' : '📄' }}
              </div>
              <div class="file-info">
                <div class="file-name">{{ file.name }}</div>
                <div class="file-size">{{ formatFileSize(file.size) }}</div>
              </div>
              <button class="remove-btn" @click="removeFile(index)">✕</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作按钮 -->
      <div class="uploader-actions">
        <button class="btn" @click="handleCancel">取消</button>
        <button class="btn-primary" :disabled="selectedFiles.length === 0" @click="handleUpload">
          上传 ({{ selectedFiles.length }})
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uploader-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.uploader-container {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--theme-shadow);
}

.uploader-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--theme-border);
}

.uploader-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--theme-text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text);
}

.uploader-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.drop-zone {
  border: 2px dashed var(--theme-border);
  border-radius: 12px;
  padding: 40px 24px;
  text-align: center;
  transition: all 0.2s ease;
  background-color: var(--theme-bg-secondary);
}

.drop-zone.dragging {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.drop-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.drop-zone h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.drop-zone p {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 8px 0;
}

.select-btn {
  display: inline-block;
  margin-top: 16px;
  position: relative;
  overflow: hidden;
}

.select-btn input[type='file'] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.file-hint {
  font-size: 12px !important;
  margin-top: 16px !important;
  color: var(--theme-text-secondary) !important;
}

.file-list {
  margin-top: 24px;
}

.file-list-header {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--theme-border);
  margin-bottom: 16px;
}

.file-list-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.file-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
}

.file-icon {
  font-size: 24px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--theme-bg-hover);
  border-radius: 6px;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.remove-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.remove-btn:hover {
  background-color: var(--theme-bg-hover);
  color: var(--theme-danger);
}

.uploader-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--theme-border);
}

.uploader-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
