<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useFileManager } from '@renderer/composables/knowledge/useFileManager'
import type { FileItem } from '@renderer/types'

const emit = defineEmits<{
  (e: 'close'): void
}>()

// ==================== 文件管理 ====================
const {
  loading,
  searchQuery,
  filteredFiles,
  loadFiles,
  searchFiles,
  uploadFiles,
  deleteFile,
  formatFileSize,
  formatDate
} = useFileManager()

// ==================== 状态管理 ====================
const isDragging = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const deletingFileId = ref<string | null>(null)
const showConfirmDialog = ref(false)
const fileToDelete = ref<FileItem | null>(null)
const deleteError = ref('')

// ==================== 文件图标 ====================
function getFileIconComponent(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'pdf'
    case 'txt':
      return 'txt'
    case 'md':
      return 'md'
    default:
      return 'default'
  }
}

// ==================== 拖拽上传 ====================
function handleDragOver(event: DragEvent): void {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent): void {
  event.preventDefault()
  isDragging.value = false
}

async function handleDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  isDragging.value = false

  const droppedFiles = Array.from(event.dataTransfer?.files || [])
  await processUpload(droppedFiles)
}

// ==================== 点击上传 ====================
function handleFileSelect(event: Event): void {
  const target = event.target as HTMLInputElement
  const selectedFiles = Array.from(target.files || [])
  if (selectedFiles.length > 0) {
    processUpload(selectedFiles)
  }
  // 重置 input 以便可以再次选择相同的文件
  target.value = ''
}

// ==================== 上传处理 ====================
async function processUpload(fileList: File[]): Promise<void> {
  // 过滤支持的文件类型
  const supportedTypes = ['.txt', '.md', '.pdf']
  const validFiles = fileList.filter((file) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    return supportedTypes.includes(ext)
  })

  if (validFiles.length < fileList.length) {
    alert('部分文件格式不支持。仅支持 .txt、.md 和 .pdf 文件。')
  }

  if (validFiles.length === 0) return

  isUploading.value = true
  uploadProgress.value = 0

  try {
    const result = await uploadFiles(validFiles)

    if (result.duplicates.length > 0) {
      const names = result.duplicates.map((f) => f.name).join(', ')
      alert(`以下文件已存在，已自动关联：${names}`)
    }

    if (result.errors.length > 0) {
      alert(`部分文件上传失败：\n${result.errors.join('\n')}`)
    }
  } finally {
    isUploading.value = false
    uploadProgress.value = 0
  }
}

// ==================== 删除处理 ====================
async function handleDeleteClick(file: FileItem): Promise<void> {
  fileToDelete.value = file
  deleteError.value = ''

  if (file.usedByKBIds.length > 0) {
    // 如果文件被使用，显示确认对话框
    showConfirmDialog.value = true
  } else {
    // 直接删除
    await performDelete()
  }
}

async function performDelete(forceDelete: boolean = false): Promise<void> {
  if (!fileToDelete.value) return

  deletingFileId.value = fileToDelete.value.id
  const result = await deleteFile(fileToDelete.value.id, forceDelete)
  deletingFileId.value = null

  if (result.success) {
    showConfirmDialog.value = false
    fileToDelete.value = null
  } else {
    deleteError.value = result.error || '删除失败'
  }
}

function cancelDelete(): void {
  showConfirmDialog.value = false
  fileToDelete.value = null
  deleteError.value = ''
}

// ==================== 生命周期 ====================
onMounted(async () => {
  await loadFiles()
})
</script>

<template>
  <div class="file-manager-overlay" @click.self="emit('close')">
    <div class="file-manager-container">
      <!-- 头部 -->
      <div class="file-manager-header">
        <h2>文件管理</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <!-- 搜索栏 -->
      <div class="file-manager-toolbar">
        <div class="search-box">
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索文件..."
            @input="searchFiles(searchQuery)"
          />
          <span class="search-icon">🔍</span>
        </div>
        <div class="file-stats">共 {{ filteredFiles.length }} 个文件</div>
      </div>

      <!-- 拖拽上传区域 -->
      <div
        :class="['drop-zone', { dragging: isDragging, uploading: isUploading }]"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div v-if="!isUploading" class="drop-content">
          <div class="drop-icon">📁</div>
          <p class="drop-text">拖放文件到这里上传</p>
          <p class="drop-hint">或</p>
          <label class="btn btn-secondary upload-btn">
            选择文件
            <input type="file" multiple accept=".txt,.md,.pdf" @change="handleFileSelect" />
          </label>
          <p class="file-types">支持 .txt、.md、.pdf，最大 50MB</p>
        </div>
        <div v-else class="uploading-content">
          <div class="upload-spinner"></div>
          <p>正在上传...</p>
        </div>
      </div>

      <!-- 文件列表 -->
      <div class="file-list-container">
        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          <p>加载中...</p>
        </div>

        <div v-else-if="filteredFiles.length === 0" class="empty-state">
          <div class="empty-icon">📂</div>
          <p v-if="searchQuery">未找到匹配的文件</p>
          <p v-else>暂无文件，请上传文件</p>
        </div>

        <div v-else class="file-grid">
          <div v-for="file in filteredFiles" :key="file.id" class="file-card">
            <!-- 文件图标 -->
            <div :class="['file-icon', `file-icon-${getFileIconComponent(file.fileType)}`]">
              <!-- PDF Icon -->
              <svg
                v-if="file.fileType === 'pdf'"
                class="file-icon-svg"
                viewBox="0 0 1024 1024"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M204.8 0h477.866667l273.066666 273.066667v614.4c0 75.093333-61.44 136.533333-136.533333 136.533333H204.8c-75.093333 0-136.533333-61.44-136.533333-136.533333V136.533333C68.266667 61.44 129.706667 0 204.8 0z m477.866667 730.453333c20.48 0 68.266667 0 68.266666-47.786666 0-20.48-6.826667-47.786667-68.266666-47.786667-27.306667 0-54.613333 6.826667-81.92 6.826667-34.133333-27.306667-68.266667-61.44-88.746667-102.4 20.48-75.093333 20.48-122.88 6.826667-150.186667-6.826667-6.826667-20.48-13.653333-34.133334-13.653333-20.48 0-34.133333 6.826667-40.96 20.48-20.48 40.96 13.653333 116.053333 27.306667 150.186666-20.48 54.613333-40.96 109.226667-68.266667 163.84C273.066667 764.586667 273.066667 798.72 273.066667 812.373333c0 13.653333 6.826667 27.306667 20.48 34.133334 6.826667 6.826667 13.653333 6.826667 20.48 6.826666 34.133333 0 68.266667-34.133333 116.053333-109.226666 54.613333-20.48 102.4-40.96 157.013333-47.786667 27.306667 20.48 61.44 34.133333 95.573334 34.133333zM491.52 416.426667c6.826667 20.48 6.826667 47.786667 0 68.266666-13.653333-20.48-13.653333-40.96-13.653333-68.266666h13.653333z m-177.493333 395.946666c13.653333-20.48 27.306667-27.306667 47.786666-40.96-13.653333 20.48-27.306667 34.133333-47.786666 40.96z m184.32-204.8c13.653333 20.48 34.133333 47.786667 54.613333 68.266667H546.133333c-27.306667 6.826667-61.44 13.653333-88.746666 27.306667 13.653333-34.133333 27.306667-61.44 40.96-95.573334zM707.072 556.544h-64l-32.768 54.272-33.792-54.272H501.76l59.392 83.968L495.616 732.16h66.048l37.376-56.32 37.376 56.32h66.048l-64.512-90.624zM707.072 556.544v43.52h59.904v132.608h58.88v-132.608H885.76v-43.52h-178.176z"
                  fill="currentColor"
                />
              </svg>

              <!-- TXT Icon -->
              <svg
                v-else-if="file.fileType === 'txt'"
                class="file-icon-svg"
                viewBox="0 0 1024 1024"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M899.072 403.968h-14.336V275.456c0-8.192-3.072-16.384-9.216-22.016L624.128 11.776c-6.144-5.632-13.312-8.704-21.504-8.704h-465.92C89.088 3.072 50.688 41.472 50.688 89.088v845.824c0 47.616 38.4 86.016 86.016 86.016h662.528c22.528 0 45.056-9.216 60.928-25.6 16.384-16.384 25.088-37.888 24.576-60.416v-60.416h14.848c22.528 0 43.52-8.704 59.392-25.088 15.872-15.872 24.576-36.864 24.064-58.88V487.936c0-46.08-37.888-83.968-83.968-83.968z m-292.864-324.096l185.856 178.176-185.856-4.608V79.872z m217.088 855.04c0.512 6.656-2.048 12.8-6.656 17.408-4.608 4.608-10.752 7.168-17.408 7.168H136.704c-13.312 0-24.576-11.264-24.576-24.576V89.088c0-13.312 11.264-24.576 24.576-24.576h408.064v219.136c0 16.896 12.8 30.208 29.696 30.72l248.832 6.144v83.456h-527.36c-46.08 0-83.968 37.888-83.968 83.968v302.592c0 46.08 37.888 83.968 83.968 83.968h527.36v60.416z m98.304-144.384c0 6.144-2.048 11.776-6.144 15.872s-9.728 6.656-15.872 6.656H295.936c-12.288 0-22.528-10.24-22.528-22.528V487.936c0-12.288 10.24-22.528 22.528-22.528h603.136c12.288 0 22.528 10.24 22.528 22.528v302.592z"
                  fill="currentColor"
                />
              </svg>

              <!-- MD Icon -->
              <svg
                v-else-if="file.fileType === 'md'"
                class="file-icon-svg"
                viewBox="0 0 1024 1024"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M903.542857 256.8c6.857143 6.857143 10.742857 16.114286 10.742857 25.828571V987.428571c0 20.228571-16.342857 36.571429-36.571428 36.571429H146.285714c-20.228571 0-36.571429-16.342857-36.571429-36.571429V36.571429c0-20.228571 16.342857-36.571429 36.571428-36.571429h485.371429c9.714286 0 19.085714 3.885714 25.942857 10.742857l245.942857 246.057143zM829.942857 299.428571L614.857143 84.342857V299.428571h215.085714zM413.862857 613.634286l67.554286 151.965714a18.285714 18.285714 0 0 0 16.708571 10.857143h27.497143a18.285714 18.285714 0 0 0 16.72-10.868572l67.542857-152.4V793.142857a18.285714 18.285714 0 0 0 18.297143 18.285714H659.428571a18.285714 18.285714 0 0 0 18.285715-18.285714V482.285714a18.285714 18.285714 0 0 0-18.285715-18.285714h-39.714285a18.285714 18.285714 0 0 0-16.765715 10.994286L512.114286 683.657143l-90.834286-208.674286a18.285714 18.285714 0 0 0-16.765714-10.982857H364.571429a18.285714 18.285714 0 0 0-18.285715 18.285714v310.857143a18.285714 18.285714 0 0 0 18.285715 18.285714h31.005714a18.285714 18.285714 0 0 0 18.285714-18.285714V613.634286z"
                  fill="currentColor"
                />
              </svg>

              <!-- Default Icon -->
              <svg
                v-else
                class="file-icon-svg"
                viewBox="0 0 1024 1024"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M853.333333 256H640V42.666667h42.666667v170.666666h170.666666V256zM298.666667 896h426.666666V469.333333H298.666667v426.666667z m0-512h426.666666V298.666667H298.666667v85.333333zM256 128h298.666667v85.333333H256V128z"
                  fill="currentColor"
                />
              </svg>
            </div>

            <!-- 文件信息 -->
            <div class="file-info">
              <div class="file-name" :title="file.name">{{ file.name }}</div>
              <div class="file-meta">
                <span class="file-size">{{ formatFileSize(file.size) }}</span>
                <span class="file-date">{{ formatDate(file.uploadedAt) }}</span>
              </div>
            </div>

            <!-- 操作按钮容器 -->
            <div class="file-actions">
              <!-- 使用状态标签 -->
              <div v-if="file.usedByKBIds.length > 0" class="usage-badge">使用中</div>

              <!-- 删除按钮 -->
              <button
                class="delete-btn"
                :disabled="deletingFileId === file.id"
                :title="file.usedByKBIds.length > 0 ? '文件被知识库使用，删除需谨慎' : '删除文件'"
                @click="handleDeleteClick(file)"
              >
                <span v-if="deletingFileId === file.id" class="spinner-small"></span>
                <span v-else class="delete-text">删除</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <div v-if="showConfirmDialog" class="confirm-dialog-overlay">
      <div class="confirm-dialog">
        <div class="confirm-dialog-header">
          <h3>⚠️ 确认删除</h3>
        </div>
        <div class="confirm-dialog-body">
          <p v-if="fileToDelete">
            文件 "<strong>{{ fileToDelete.name }}</strong
            >" 正在被 <strong>{{ fileToDelete.usedByKBIds.length }}</strong> 个知识库使用。
          </p>
          <p>删除此文件将从所有关联的知识库中移除。此操作不可撤销。</p>
          <p v-if="deleteError" class="error-message">{{ deleteError }}</p>
        </div>
        <div class="confirm-dialog-actions">
          <button class="btn" @click="cancelDelete">取消</button>
          <button class="btn btn-danger" :disabled="!!deletingFileId" @click="performDelete(true)">
            <span v-if="deletingFileId" class="spinner-small"></span>
            <span v-else>强制删除</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-manager-overlay {
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

.file-manager-container {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--theme-shadow);
}

/* 头部 */
.file-manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--theme-border);
}

.file-manager-header h2 {
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
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text);
}

/* 工具栏 */
.file-manager-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  gap: 16px;
  border-bottom: 1px solid var(--theme-border);
}

.search-box {
  position: relative;
  flex: 1;
  max-width: 300px;
}

.search-input {
  width: 100%;
  padding: 8px 12px 8px 36px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
  font-size: 14px;
  outline: none;
  transition: all 0.15s ease;
}

.search-input:focus {
  border-color: var(--theme-accent);
  box-shadow: 0 0 0 2px rgba(63, 185, 80, 0.1);
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  opacity: 0.5;
}

.file-stats {
  font-size: 13px;
  color: var(--theme-text-secondary);
}

/* 拖拽上传区域 */
.drop-zone {
  margin: 16px 24px;
  padding: 24px;
  border: 2px dashed var(--theme-border);
  border-radius: 12px;
  text-align: center;
  transition: all 0.2s ease;
  background-color: var(--theme-bg-secondary);
}

.drop-zone.dragging {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.drop-zone.uploading {
  opacity: 0.7;
  pointer-events: none;
}

.drop-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.drop-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0 0 4px 0;
}

.drop-hint {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 4px 0;
}

.upload-btn {
  position: relative;
  overflow: hidden;
  margin-top: 8px;
}

.upload-btn input[type='file'] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.file-types {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 8px;
}

.uploading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* 文件列表 */
.file-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 24px;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

/* 文件卡片 */
.file-card {
  position: relative;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.2s ease;
}

.file-card:hover {
  border-color: var(--theme-accent);
  box-shadow: var(--theme-shadow);
}

.file-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
}

.file-icon-pdf {
  background-color: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.file-icon-txt {
  background-color: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.file-icon-md {
  background-color: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.file-icon-default {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.file-icon-svg {
  width: 28px;
  height: 28px;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--theme-text-secondary);
}

/* 文件操作按钮容器 */
.file-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.usage-badge {
  padding: 5px 8px;
  border: 1px solid var(--theme-accent);
  background-color: var(--theme-accent);
  color: white;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.delete-btn {
  padding: 5px 8px;
  border: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  opacity: 0;
  flex-shrink: 0;
  line-height: 1;
}

.file-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background-color: var(--theme-danger);
  border-color: var(--theme-danger);
  color: white;
}

.delete-btn:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed;
}

.delete-text {
  font-size: 12px;
}

/* 加载状态 */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 0;
}

/* Spinner */
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
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

.upload-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* 确认对话框 */
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

.btn-secondary {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: white;
}

.btn-secondary:hover {
  opacity: 0.9;
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

/* 滚动条样式 */
.file-list-container::-webkit-scrollbar {
  width: 6px;
}

.file-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.file-list-container::-webkit-scrollbar-thumb {
  background-color: var(--theme-border);
  border-radius: 3px;
}

.file-list-container::-webkit-scrollbar-thumb:hover {
  background-color: var(--theme-text-secondary);
}
</style>
