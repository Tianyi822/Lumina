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
            class="btn btn-primary"
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
  padding: 16px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background-color: var(--theme-bg-secondary);
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
  color: var(--theme-text);
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
  border: 2px dashed var(--theme-border);
  border-radius: var(--theme-radius);
  background-color: var(--theme-bg);
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-dropzone:hover {
  border-color: var(--theme-accent);
  background-color: rgba(var(--theme-accent-rgb, 59 130 246), 0.02);
}

.upload-dropzone.is-dragging {
  border-color: var(--theme-accent);
  background-color: rgba(var(--theme-accent-rgb, 59 130 246), 0.05);
  transform: scale(1.01);
}

.upload-dropzone.has-file {
  border-style: solid;
  border-color: var(--theme-accent);
  background-color: rgba(var(--theme-accent-rgb, 59 130 246), 0.02);
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
  background-color: var(--theme-bg-secondary);
  border-radius: 50%;
  color: var(--theme-accent);
}

.upload-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.upload-title {
  font-size: 14px;
  color: var(--theme-text);
  margin: 0;
}

.upload-link {
  color: var(--theme-accent);
  font-weight: 500;
}

.upload-hint {
  font-size: 12px;
  color: var(--theme-text-tertiary);
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
  background-color: var(--theme-bg-secondary);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-accent);
  flex-shrink: 0;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: var(--theme-text-tertiary);
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
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  color: var(--theme-text-tertiary);
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
  border-top: 1px solid var(--theme-border);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-input {
  flex: 1;
  min-height: 38px;
  padding: 8px 12px;
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  color: var(--theme-text);
  font-size: 13px;
  transition: border-color 0.15s ease;
}

.form-input:hover:not(:disabled) {
  border-color: var(--theme-border-hover);
}

.form-input:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.form-hint {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

/* 按钮 */
.btn {
  min-height: 38px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  font-family: var(--theme-font);
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--theme-accent);
  border: 1px solid var(--theme-accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-loading {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
