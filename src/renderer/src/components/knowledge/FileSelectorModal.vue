<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useFileManager } from '@renderer/composables/knowledge/useFileManager'
import type { FileItem } from '@renderer/types'

const props = defineProps<{
  kbId: string
  linkedFileIds: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'filesLinked', files: FileItem[]): void
}>()

// ==================== 标签页 ====================
type TabType = 'existing' | 'upload'
const activeTab = ref<TabType>('existing')

// ==================== 文件管理 ====================
const {
  files,
  loading,
  searchQuery,
  loadFiles,
  searchFiles,
  uploadFiles,
  linkFileToKB,
  formatFileSize,
  formatDate
} = useFileManager()

// ==================== 状态管理 ====================
const selectedFileIds = ref<Set<string>>(new Set())
const isDragging = ref(false)
const isUploading = ref(false)
const linkingFileIds = ref<Set<string>>(new Set())

// ==================== 计算属性 ====================
// 过滤掉已关联的文件，并支持搜索
const availableFiles = computed(() => {
  const linkedSet = new Set(props.linkedFileIds)
  let result = files.value.filter((f) => !linkedSet.has(f.id))

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter((f) => f.name.toLowerCase().includes(query))
  }

  return result
})

const hasSelectedFiles = computed(() => selectedFileIds.value.size > 0)

const selectedCount = computed(() => selectedFileIds.value.size)

// ==================== 文件图标 ====================
function getFileIconClass(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'file-icon-pdf'
    case 'txt':
      return 'file-icon-txt'
    case 'md':
      return 'file-icon-md'
    default:
      return 'file-icon-default'
  }
}

// ==================== 文件选择 ====================
function toggleFileSelection(fileId: string): void {
  if (selectedFileIds.value.has(fileId)) {
    selectedFileIds.value.delete(fileId)
  } else {
    selectedFileIds.value.add(fileId)
  }
}

function selectAll(): void {
  availableFiles.value.forEach((f) => selectedFileIds.value.add(f.id))
}

function deselectAll(): void {
  selectedFileIds.value.clear()
}

// ==================== 关联文件 ====================
async function handleLinkSelectedFiles(): Promise<void> {
  const fileIds = Array.from(selectedFileIds.value)
  const linkedFiles: FileItem[] = []

  for (const fileId of fileIds) {
    linkingFileIds.value.add(fileId)
    const result = await linkFileToKB(fileId, props.kbId)
    linkingFileIds.value.delete(fileId)

    if (result.success) {
      const file = files.value.find((f) => f.id === fileId)
      if (file) linkedFiles.push(file)
    }
  }

  if (linkedFiles.length > 0) {
    emit('filesLinked', linkedFiles)
  }

  selectedFileIds.value.clear()
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
  target.value = ''
}

// ==================== 上传处理 ====================
async function processUpload(fileList: File[]): Promise<void> {
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

  try {
    const result = await uploadFiles(validFiles)

    // 上传成功后，自动关联到当前知识库
    const newlyUploaded: FileItem[] = []
    for (const file of result.uploaded) {
      const linkResult = await linkFileToKB(file.id, props.kbId)
      if (linkResult.success) {
        newlyUploaded.push(file)
      }
    }

    // 处理重复文件：询问是否关联
    for (const file of result.duplicates) {
      // 检查是否已关联
      if (!props.linkedFileIds.includes(file.id)) {
        const linkResult = await linkFileToKB(file.id, props.kbId)
        if (linkResult.success) {
          newlyUploaded.push(file)
        }
      }
    }

    if (newlyUploaded.length > 0) {
      emit('filesLinked', newlyUploaded)
    }

    if (result.errors.length > 0) {
      alert(`部分文件上传失败：\n${result.errors.join('\n')}`)
    }

    // 上传完成后切换到已有文件标签页
    if (newlyUploaded.length > 0 || result.duplicates.length > 0) {
      activeTab.value = 'existing'
    }
  } finally {
    isUploading.value = false
  }
}

// ==================== 生命周期 ====================
onMounted(async () => {
  await loadFiles()
})
</script>

<template>
  <div class="file-selector-overlay" @click.self="emit('close')">
    <div class="file-selector-container">
      <!-- 头部 -->
      <div class="file-selector-header">
        <h2>添加文件</h2>
        <button class="close-btn" @click="emit('close')">✕</button>
      </div>

      <!-- 标签页 -->
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'existing' }]"
          @click="activeTab = 'existing'"
        >
          从已有文件选择
        </button>
        <button :class="['tab', { active: activeTab === 'upload' }]" @click="activeTab = 'upload'">
          上传新文件
        </button>
      </div>

      <!-- 已有文件列表 -->
      <div v-if="activeTab === 'existing'" class="tab-content">
        <!-- 搜索栏 -->
        <div class="search-bar">
          <input
            v-model="searchQuery"
            type="text"
            class="search-input"
            placeholder="搜索文件..."
            @input="searchFiles(searchQuery)"
          />
          <div class="selection-actions">
            <button class="btn-link" @click="selectAll">全选</button>
            <button class="btn-link" @click="deselectAll">取消全选</button>
          </div>
        </div>

        <!-- 文件列表 -->
        <div class="file-list">
          <div v-if="loading" class="state-message">
            <div class="spinner"></div>
            <p>加载中...</p>
          </div>

          <div v-else-if="availableFiles.length === 0" class="state-message">
            <p v-if="searchQuery">未找到匹配的文件</p>
            <p v-else>没有可添加的文件，请先上传文件或切换到"上传新文件"标签页</p>
          </div>

          <div v-else class="file-items">
            <div
              v-for="file in availableFiles"
              :key="file.id"
              :class="[
                'file-item',
                { selected: selectedFileIds.has(file.id), linking: linkingFileIds.has(file.id) }
              ]"
              @click="toggleFileSelection(file.id)"
            >
              <div class="file-checkbox">
                <input
                  type="checkbox"
                  :checked="selectedFileIds.has(file.id)"
                  @click.stop
                  @change="toggleFileSelection(file.id)"
                />
              </div>

              <div :class="['file-icon', getFileIconClass(file.fileType)]">
                <!-- PDF Icon -->
                <svg
                  v-if="file.fileType === 'pdf'"
                  class="file-icon-svg"
                  viewBox="0 0 1024 1024"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M204.8 0h477.866667l273.066666 273.066667v614.4c0 75.093333-61.44 136.533333-136.533333 136.533333H204.8c-75.093333 0-136.533333-61.44-136.533333-136.533333V136.533333C68.266667 61.44 129.706667 0 204.8 0z m477.866667 730.453333c20.48 0 68.266667 0 68.266666-47.786666 0-20.48-6.826667-47.786667-68.266666-47.786667-27.306667 0-54.613333 6.826667-81.92 6.826667-34.133333-27.306667-68.266667-61.44-88.746667-102.4 20.48-75.093333 20.48-122.88 6.826667-150.186667-6.826667-6.826667-20.48-13.653333-34.133334-13.653333-20.48 0-34.133333 6.826667-40.96 20.48-20.48 40.96 13.653333 116.053333 27.306667 150.186666-20.48 54.613333-40.96 109.226667-68.266667 163.84C273.066667 764.586667 273.066667 798.72 273.066667 812.373333c0 13.653333 6.826667 27.306667 20.48 34.133334 6.826667 6.826667 13.653333 6.826667 20.48 6.826666 34.133333 0 68.266667-34.133333 116.053333-109.226666 54.613333-20.48 102.4-40.96 157.013333-47.786667 27.306667 20.48 61.44 34.133333 95.573334 34.133333z"
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
                    d="M899.072 403.968h-14.336V275.456c0-8.192-3.072-16.384-9.216-22.016L624.128 11.776c-6.144-5.632-13.312-8.704-21.504-8.704h-465.92C89.088 3.072 50.688 41.472 50.688 89.088v845.824c0 47.616 38.4 86.016 86.016 86.016h662.528c22.528 0 45.056-9.216 60.928-25.6 16.384-16.384 25.088-37.888 24.576-60.416v-60.416h14.848c22.528 0 43.52-8.704 59.392-25.088 15.872-15.872 24.576-36.864 24.064-58.88V487.936c0-46.08-37.888-83.968-83.968-83.968z m-292.864-324.096l185.856 178.176-185.856-4.608V79.872z"
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

              <div class="file-details">
                <div class="file-name">{{ file.name }}</div>
                <div class="file-meta">
                  <span>{{ formatFileSize(file.size) }}</span>
                  <span>{{ formatDate(file.uploadedAt) }}</span>
                </div>
              </div>

              <div v-if="linkingFileIds.has(file.id)" class="linking-indicator">
                <div class="spinner-small"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="bottom-bar">
          <span class="selection-count"> 已选择 {{ selectedCount }} 个文件 </span>
          <div class="actions">
            <button class="btn" @click="emit('close')">取消</button>
            <button
              class="btn btn-primary"
              :disabled="!hasSelectedFiles"
              @click="handleLinkSelectedFiles"
            >
              添加到知识库
            </button>
          </div>
        </div>
      </div>

      <!-- 上传新文件 -->
      <div v-else class="tab-content">
        <div
          :class="['upload-zone', { dragging: isDragging, uploading: isUploading }]"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
        >
          <div v-if="!isUploading" class="upload-content">
            <div class="upload-icon">📁</div>
            <p class="upload-text">拖放文件到这里上传</p>
            <p class="upload-hint">或</p>
            <label class="btn btn-primary upload-btn">
              选择文件
              <input type="file" multiple accept=".txt,.md,.pdf" @change="handleFileSelect" />
            </label>
            <p class="upload-types">支持 .txt、.md、.pdf，最大 50MB</p>
          </div>
          <div v-else class="uploading-content">
            <div class="spinner"></div>
            <p>正在上传并关联...</p>
          </div>
        </div>

        <div class="upload-actions">
          <button class="btn" @click="emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-selector-overlay {
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

.file-selector-container {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--theme-shadow);
}

/* 头部 */
.file-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--theme-border);
}

.file-selector-header h2 {
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

/* 标签页 */
.tabs {
  display: flex;
  padding: 0 24px;
  border-bottom: 1px solid var(--theme-border);
  gap: 4px;
}

.tab {
  padding: 12px 20px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--theme-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: -1px;
}

.tab:hover {
  color: var(--theme-text);
}

.tab.active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
}

/* 标签内容 */
.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 400px;
}

/* 搜索栏 */
.search-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  gap: 16px;
  border-bottom: 1px solid var(--theme-border);
}

.search-input {
  flex: 1;
  padding: 8px 12px;
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

.selection-actions {
  display: flex;
  gap: 12px;
}

.btn-link {
  background: transparent;
  border: none;
  color: var(--theme-accent);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.btn-link:hover {
  background-color: rgba(63, 185, 80, 0.1);
}

/* 文件列表 */
.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.file-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.file-item:hover {
  background-color: var(--theme-bg-secondary);
}

.file-item.selected {
  background-color: rgba(63, 185, 80, 0.1);
  border-color: var(--theme-accent);
}

.file-item.linking {
  opacity: 0.7;
  pointer-events: none;
}

.file-checkbox {
  flex-shrink: 0;
}

.file-checkbox input[type='checkbox'] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--theme-accent);
}

.file-icon {
  width: 40px;
  height: 40px;
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
  width: 24px;
  height: 24px;
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.linking-indicator {
  flex-shrink: 0;
}

/* 底部操作栏 */
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.selection-count {
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.actions {
  display: flex;
  gap: 12px;
}

/* 上传区域 */
.upload-zone {
  flex: 1;
  margin: 24px;
  border: 2px dashed var(--theme-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: all 0.2s ease;
  background-color: var(--theme-bg-secondary);
}

.upload-zone.dragging {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.upload-zone.uploading {
  opacity: 0.7;
  pointer-events: none;
}

.upload-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.upload-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.upload-hint {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 4px 0;
}

.upload-btn {
  position: relative;
  overflow: hidden;
  margin-top: 12px;
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

.upload-types {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 12px;
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 24px 24px;
}

/* 状态消息 */
.state-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--theme-text-secondary);
}

.state-message p {
  margin: 0;
  font-size: 14px;
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
  width: 16px;
  height: 16px;
  border: 2px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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

.btn-primary {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 滚动条 */
.file-list::-webkit-scrollbar {
  width: 6px;
}

.file-list::-webkit-scrollbar-track {
  background: transparent;
}

.file-list::-webkit-scrollbar-thumb {
  background-color: var(--theme-border);
  border-radius: 3px;
}

.file-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--theme-text-secondary);
}
</style>
