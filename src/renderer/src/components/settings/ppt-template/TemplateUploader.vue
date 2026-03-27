<script setup lang="ts">
import { ref } from 'vue'
import { useTemplateUpload } from './composables/useTemplateUpload'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

interface Emits {
  (e: 'error', message: string): void
  (e: 'success', message: string): void
}

const emit = defineEmits<Emits>()

// 文件输入框引用
const fileInputRef = ref<HTMLInputElement | null>(null)

const {
  selectedFile,
  templateName,
  isDragging,
  uploading,
  handleFileSelect,
  createTriggerFileSelect,
  handleDragEnter,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  handleUpload,
  createResetForm,
  formatFileSize
} = useTemplateUpload(
  (msg) => emit('error', msg),
  (msg) => emit('success', msg)
)

// 创建使用 fileInputRef 的函数
const triggerFileSelect = createTriggerFileSelect(fileInputRef)
const resetForm = createResetForm(fileInputRef)
</script>

<template>
  <div class="upload-section">
    <div class="section-header">
      <h3 class="section-title">上传 PPT 模板</h3>
    </div>

    <!-- 拖拽上传区域 -->
    <div
      class="upload-dropzone"
      :class="{
        'is-dragging': isDragging,
        'has-file': selectedFile
      }"
      @click="triggerFileSelect"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
      @dragover="handleDragOver"
      @drop="handleDrop"
    >
      <input
        ref="fileInputRef"
        type="file"
        accept=".pptx"
        class="hidden-input"
        @change="handleFileSelect"
      />

      <!-- 未选择文件时的状态 -->
      <div v-if="!selectedFile" class="dropzone-content">
        <div class="upload-icon">
          <SvgIcon name="upload" :size="24" />
        </div>
        <div class="upload-text">
          <p class="upload-title">拖拽文件到此处，或 <span class="upload-link">点击上传</span></p>
          <p class="upload-hint">支持 .pptx 格式，最大 50MB</p>
        </div>
      </div>

      <!-- 已选择文件时的状态 -->
      <div v-else class="dropzone-file-info">
        <div class="file-icon">
          <SvgIcon name="file" :size="20" />
        </div>
        <div class="file-details">
          <p class="file-name">{{ selectedFile.name }}</p>
          <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
        </div>
        <button class="btn-remove" title="移除文件" @click.stop="resetForm">
          <SvgIcon name="close" :size="16" />
        </button>
      </div>
    </div>

    <!-- 模板名称输入（文件选择后显示） -->
    <div v-if="selectedFile" class="upload-form-footer">
      <div class="form-group">
        <label class="form-label" for="template-name">模板名称</label>
        <div class="form-row">
          <input
            id="template-name"
            v-model="templateName"
            type="text"
            class="form-input"
            placeholder="输入模板名称"
          />
          <button
            class="sm-button sm-button--primary"
            :disabled="!templateName.trim() || uploading"
            @click="handleUpload"
          >
            <span v-if="uploading" class="btn-loading">
              <SvgIcon name="spinner" :size="14" :spin="true" />
              上传中
            </span>
            <span v-else>上传模板</span>
          </button>
        </div>
        <span class="form-hint">保存后不可修改名称</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin: 0;
}

/* 拖拽上传区域 */
.upload-dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  padding: 24px;
  border: 1px dashed var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.upload-dropzone:hover {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-surface-hover);
}

.upload-dropzone.is-dragging {
  border-color: var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.08);
}

.upload-dropzone.has-file {
  border-style: solid;
  border-color: var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.08);
}

.hidden-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

/* 拖拽区域内容 */
.dropzone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.upload-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  color: var(--sm-color-accent-hover);
}

.upload-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.upload-title {
  font-size: 14px;
  color: var(--sm-color-text-primary);
  margin: 0;
}

.upload-link {
  color: var(--sm-color-accent-hover);
  font-weight: 500;
}

.upload-hint {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  margin: 0;
}

/* 已选文件信息 */
.dropzone-file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px;
}

.file-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-accent-hover);
  flex-shrink: 0;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  margin: 4px 0 0 0;
}

.btn-remove {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--sm-radius-sm);
  cursor: pointer;
  color: var(--sm-color-text-secondary);
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-remove:hover {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 上传表单底部 */
.upload-form-footer {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--sm-color-border-subtle);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-input {
  flex: 1;
  min-height: 36px;
}

.form-hint {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.btn-loading {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
