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
  <div class="sm-ppt-upload">
    <div class="sm-ppt-upload__header">
      <h3 class="sm-settings-page__section-title">上传 PPT 模板</h3>
    </div>

    <div
      class="sm-ppt-upload__dropzone"
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
        class="sm-ppt-upload__input"
        @change="handleFileSelect"
      />

      <div v-if="!selectedFile" class="sm-ppt-upload__placeholder">
        <div class="sm-ppt-upload__icon">
          <SvgIcon name="upload" :size="24" />
        </div>
        <div class="sm-ppt-upload__copy">
          <p class="sm-ppt-upload__title">
            拖拽文件到此处，或 <span class="sm-ppt-upload__link">点击上传</span>
          </p>
          <p class="sm-ppt-upload__subtitle">支持 .pptx 格式，最大 50MB</p>
        </div>
      </div>

      <div v-else class="sm-ppt-upload__file">
        <div class="sm-ppt-upload__file-icon">
          <SvgIcon name="file" :size="20" />
        </div>
        <div class="sm-ppt-upload__file-details">
          <p class="sm-ppt-upload__file-name">{{ selectedFile.name }}</p>
          <p class="sm-ppt-upload__file-size">{{ formatFileSize(selectedFile.size) }}</p>
        </div>
        <button class="sm-icon-button sm-ppt-upload__remove" title="移除文件" @click.stop="resetForm">
          <SvgIcon name="close" :size="16" />
        </button>
      </div>
    </div>

    <div v-if="selectedFile" class="sm-ppt-upload__form">
      <div class="sm-ppt-upload__field">
        <label class="sm-ppt-upload__label" for="template-name">模板名称</label>
        <div class="sm-ppt-upload__row">
          <input
            id="template-name"
            v-model="templateName"
            type="text"
            class="sm-input"
            placeholder="输入模板名称"
          />
          <button
            class="sm-button sm-button--primary"
            :disabled="!templateName.trim() || uploading"
            @click="handleUpload"
          >
            <span v-if="uploading" class="sm-ppt-upload__button-label">
              <SvgIcon name="spinner" :size="14" :spin="true" />
              上传中
            </span>
            <span v-else>上传模板</span>
          </button>
        </div>
        <span class="sm-ppt-upload__hint">保存后不可修改名称</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sm-ppt-upload {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
}

.sm-ppt-upload__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sm-ppt-upload__dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 140px;
  padding: 24px;
  border: 1px dashed var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.sm-ppt-upload__dropzone:hover {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-surface-hover);
}

.sm-ppt-upload__dropzone.is-dragging,
.sm-ppt-upload__dropzone.has-file {
  border-color: var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.08);
}

.sm-ppt-upload__dropzone.has-file {
  border-style: solid;
}

.sm-ppt-upload__input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.sm-ppt-upload__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.sm-ppt-upload__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  color: var(--sm-color-accent-hover);
}

.sm-ppt-upload__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sm-ppt-upload__title {
  margin: 0;
  font-size: 14px;
  color: var(--sm-color-text-primary);
}

.sm-ppt-upload__link {
  color: var(--sm-color-accent-hover);
  font-weight: 500;
}

.sm-ppt-upload__subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.sm-ppt-upload__file {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
}

.sm-ppt-upload__file-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-accent-hover);
  flex-shrink: 0;
}

.sm-ppt-upload__file-details {
  flex: 1;
  min-width: 0;
}

.sm-ppt-upload__file-name {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.sm-ppt-upload__file-size {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.sm-ppt-upload__remove:hover {
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: #c77878;
}

.sm-ppt-upload__form {
  padding-top: 16px;
  border-top: 1px solid var(--sm-color-border-subtle);
}

.sm-ppt-upload__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sm-ppt-upload__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.sm-ppt-upload__row {
  display: flex;
  gap: 12px;
}

.sm-ppt-upload__row .sm-input {
  flex: 1;
}

.sm-ppt-upload__hint {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.sm-ppt-upload__button-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 640px) {
  .sm-ppt-upload__row {
    flex-direction: column;
  }

  .sm-ppt-upload__row .sm-button {
    width: 100%;
  }
}
</style>
