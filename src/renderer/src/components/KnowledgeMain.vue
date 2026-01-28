<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KnowledgeBase, Document } from '@renderer/types'

const props = defineProps<{
  knowledgeBase?: KnowledgeBase
}>()

const emit = defineEmits<{
  (e: 'upload-documents'): void
}>()

// 模拟文档数据（实际应从后端获取）
const mockDocuments = ref<Document[]>([
  {
    id: 'doc-1',
    kbId: 'kb-1',
    name: '产品介绍',
    fileType: 'md',
    fileSize: 2048,
    chunkCount: 12,
    status: 'completed',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z'
  },
  {
    id: 'doc-2',
    kbId: 'kb-1',
    name: 'API 文档',
    fileType: 'txt',
    fileSize: 4096,
    chunkCount: 24,
    status: 'completed',
    createdAt: '2024-01-15T11:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z'
  },
  {
    id: 'doc-3',
    kbId: 'kb-1',
    name: '用户手册',
    fileType: 'pdf',
    fileSize: 8192,
    chunkCount: 36,
    status: 'completed',
    createdAt: '2024-01-14T15:20:00Z',
    updatedAt: '2024-01-14T15:20:00Z'
  },
  {
    id: 'doc-4',
    kbId: 'kb-1',
    name: '开发指南',
    fileType: 'md',
    fileSize: 3072,
    chunkCount: 18,
    status: 'completed',
    createdAt: '2024-01-13T09:15:00Z',
    updatedAt: '2024-01-13T09:15:00Z'
  }
])

const currentKB = computed(() => props.knowledgeBase)

function handleUpload(): void {
  emit('upload-documents')
}

function getFileIconBgClass(fileType: string): string {
  return `file-icon-bg-${fileType.toLowerCase()}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays} 天前`
  return date.toLocaleDateString('zh-CN')
}
</script>

<template>
  <main class="kb-main">
    <div v-if="currentKB" class="kb-content">
      <!-- 顶部信息栏 -->
      <header class="kb-header">
        <div class="kb-title-row">
          <h1 class="kb-title">{{ currentKB.name }}</h1>
          <div class="kb-actions">
            <button class="btn-primary upload-btn" @click="handleUpload">
              上传文档
            </button>
          </div>
        </div>
        <p v-if="currentKB.description" class="kb-description">
          {{ currentKB.description }}
        </p>
      </header>

      <!-- 文档列表 -->
      <div class="documents-section">
        <div class="documents-grid">
          <!-- 文档卡片 -->
          <div v-for="doc in mockDocuments" :key="doc.id" class="document-card">
            <div class="doc-card-header">
              <div :class="['doc-file-icon', getFileIconBgClass(doc.fileType)]">
                <!-- PDF Icon -->
                <svg
                  v-if="doc.fileType === 'pdf'"
                  class="file-icon-svg"
                  viewBox="0 0 1024 1024"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M204.8 0h477.866667l273.066666 273.066667v614.4c0 75.093333-61.44 136.533333-136.533333 136.533333H204.8c-75.093333 0-136.533333-61.44-136.533333-136.533333V136.533333C68.266667 61.44 129.706667 0 204.8 0z m477.866667 730.453333c20.48 0 68.266667 0 68.266666-47.786666 0-20.48-6.826667-47.786667-68.266666-47.786667-27.306667 0-54.613333 6.826667-81.92 6.826667-34.133333-27.306667-68.266667-61.44-88.746667-102.4 20.48-75.093333 20.48-122.88 6.826667-150.186667-6.826667-6.826667-20.48-13.653333-34.133334-13.653333-20.48 0-34.133333 6.826667-40.96 20.48-20.48 40.96 13.653333 116.053333 27.306667 150.186666-20.48 54.613333-40.96 109.226667-68.266667 163.84C273.066667 764.586667 273.066667 798.72 273.066667 812.373333c0 13.653333 6.826667 27.306667 20.48 34.133334 6.826667 6.826667 13.653333 6.826667 20.48 6.826666 34.133333 0 68.266667-34.133333 116.053333-109.226666 54.613333-20.48 102.4-40.96 157.013333-47.786667 27.306667 20.48 61.44 34.133333 95.573334 34.133333zM491.52 416.426667c6.826667 20.48 6.826667 47.786667 0 68.266666-13.653333-20.48-13.653333-40.96-13.653333-68.266666h13.653333z m-177.493333 395.946666c13.653333-20.48 27.306667-27.306667 47.786666-40.96-13.653333 20.48-27.306667 34.133333-47.786666 40.96z m184.32-204.8c13.653333 20.48 34.133333 47.786667 54.613333 68.266667H546.133333c-27.306667 6.826667-61.44 13.653333-88.746666 27.306667 13.653333-34.133333 27.306667-61.44 40.96-95.573334z m177.493333 68.266667c27.306667 0 34.133333 6.826667 34.133333 13.653333-6.826667 0-20.48 6.826667-27.306666 0-13.653333 0-27.306667-6.826667-40.96-13.653333h34.133333z"
                    fill="currentColor"
                  />
                  <path
                    d="M682.666667 0l273.066666 273.066667h-204.8c-40.96 0-68.266667-27.306667-68.266666-68.266667V0z"
                    fill="currentColor"
                    opacity="0.3"
                  />
                </svg>

                <!-- TXT Icon -->
                <svg
                  v-else-if="doc.fileType === 'txt'"
                  class="file-icon-svg"
                  viewBox="0 0 1024 1024"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M899.072 403.968h-14.336V275.456c0-8.192-3.072-16.384-9.216-22.016L624.128 11.776c-6.144-5.632-13.312-8.704-21.504-8.704h-465.92C89.088 3.072 50.688 41.472 50.688 89.088v845.824c0 47.616 38.4 86.016 86.016 86.016h662.528c22.528 0 45.056-9.216 60.928-25.6 16.384-16.384 25.088-37.888 24.576-60.416v-60.416h14.848c22.528 0 43.52-8.704 59.392-25.088 15.872-15.872 24.576-36.864 24.064-58.88V487.936c0-46.08-37.888-83.968-83.968-83.968z m-292.864-324.096l185.856 178.176-185.856-4.608V79.872z m217.088 855.04c0.512 6.656-2.048 12.8-6.656 17.408-4.608 4.608-10.752 7.168-17.408 7.168H136.704c-13.312 0-24.576-11.264-24.576-24.576V89.088c0-13.312 11.264-24.576 24.576-24.576h408.064v219.136c0 16.896 12.8 30.208 29.696 30.72l248.832 6.144v83.456h-527.36c-46.08 0-83.968 37.888-83.968 83.968v302.592c0 46.08 37.888 83.968 83.968 83.968h527.36v60.416z m98.304-144.384c0 6.144-2.048 11.776-6.144 15.872s-9.728 6.656-15.872 6.656H295.936c-12.288 0-22.528-10.24-22.528-22.528V487.936c0-12.288 10.24-22.528 22.528-22.528h603.136c12.288 0 22.528 10.24 22.528 22.528v302.592z"
                    fill="currentColor"
                  />
                  <path
                    d="M309.76 600.064h59.392v132.608h58.88v-132.608h59.904v-43.52H309.76zM696.832 556.544h-64l-32.768 54.272-33.792-54.272H501.76l59.392 83.968L495.616 732.16h66.048l37.376-56.32 37.376 56.32h66.048l-64.512-90.624zM707.072 556.544v43.52h59.904v132.608h58.88v-132.608H885.76v-43.52h-178.176z"
                    fill="currentColor"
                  />
                </svg>

                <!-- Markdown Icon -->
                <svg
                  v-else-if="doc.fileType === 'md'"
                  class="file-icon-svg"
                  viewBox="0 0 1024 1024"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M903.542857 256.8c6.857143 6.857143 10.742857 16.114286 10.742857 25.828571V987.428571c0 20.228571-16.342857 36.571429-36.571428 36.571429H146.285714c-20.228571 0-36.571429-16.342857-36.571429-36.571429V36.571429c0-20.228571 16.342857-36.571429 36.571428-36.571429h485.371429c9.714286 0 19.085714 3.885714 25.942857 10.742857l245.942857 246.057143zM829.942857 299.428571L614.857143 84.342857V299.428571h215.085714zM413.862857 613.634286l67.554286 151.965714a18.285714 18.285714 0 0 0 16.708571 10.857143h27.497143a18.285714 18.285714 0 0 0 16.72-10.868572l67.542857-152.4V793.142857a18.285714 18.285714 0 0 0 18.297143 18.285714H659.428571a18.285714 18.285714 0 0 0 18.285715-18.285714V482.285714a18.285714 18.285714 0 0 0-18.285715-18.285714h-39.714285a18.285714 18.285714 0 0 0-16.765715 10.994286L512.114286 683.657143l-90.834286-208.674286a18.285714 18.285714 0 0 0-16.765714-10.982857H364.571429a18.285714 18.285714 0 0 0-18.285715 18.285714v310.857143a18.285714 18.285714 0 0 0 18.285715 18.285714h31.005714a18.285714 18.285714 0 0 0 18.285714-18.285714V613.634286z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div class="doc-status-indicator" :class="doc.status" />
            </div>
            <div class="doc-card-body">
              <h3 class="doc-card-title">{{ doc.name }}</h3>
              <div class="doc-card-meta">
                <span class="doc-file-type">{{ doc.fileType.toUpperCase() }}</span>
                <span class="doc-file-size">{{ formatFileSize(doc.fileSize) }}</span>
              </div>
              <div class="doc-card-stats">
                <span class="doc-stat">{{ doc.chunkCount }} 个分块</span>
                <span class="doc-stat">{{ formatDate(doc.createdAt) }}</span>
              </div>
            </div>
          </div>

          <!-- 添加文件占位符 -->
          <div class="add-file-card" @click="handleUpload">
            <div class="add-file-icon">+</div>
            <div class="add-file-text">添加文件</div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="mockDocuments.length === 0" class="empty-state">
          <div class="empty-icon">📭</div>
          <h3>暂无文档</h3>
          <p>点击下方"添加文件"按钮或使用上方"上传文档"按钮添加文档到知识库</p>
        </div>
      </div>
    </div>

    <!-- 空状态（未选择知识库） -->
    <div v-else class="empty-kb">
      <h2>选择或创建知识库</h2>
      <p>从左侧选择一个知识库，或创建新的知识库开始使用</p>
    </div>
  </main>
</template>

<style scoped>
.kb-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--theme-bg);
  overflow: hidden;
}

.kb-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 顶部信息栏 */
.kb-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--theme-border);
}

.kb-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.kb-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
  line-height: 28px;
}

.kb-description {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.kb-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.upload-btn {
  padding: 0 14px;
  font-size: 13px;
  height: 28px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 文档列表 */
.documents-section {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.documents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

/* 文档卡片 */
.document-card {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  padding: 16px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.document-card:hover {
  border-color: var(--theme-accent);
  transform: translateY(-2px);
  box-shadow: var(--theme-shadow);
}

.doc-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.doc-file-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
}

.file-icon-svg {
  width: 32px;
  height: 32px;
}

.doc-file-icon-bg-pdf {
  background-color: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.doc-file-icon-bg-pdf .file-icon-svg {
  color: #f85149;
}

.doc-file-icon-bg-txt {
  background-color: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.doc-file-icon-bg-txt .file-icon-svg {
  color: #58a6ff;
}

.doc-file-icon-bg-md {
  background-color: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.doc-file-icon-bg-md .file-icon-svg {
  color: #3fb950;
}

.doc-status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.doc-status-indicator.completed {
  background-color: var(--theme-success);
  box-shadow: 0 0 6px rgba(63, 185, 80, 0.4);
}

.doc-status-indicator.processing,
.doc-status-indicator.pending {
  background-color: var(--theme-warning);
  box-shadow: 0 0 6px rgba(210, 153, 34, 0.4);
  animation: pulse 1.5s infinite;
}

.doc-status-indicator.failed {
  background-color: var(--theme-danger);
  box-shadow: 0 0 6px rgba(248, 81, 73, 0.4);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.doc-card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-card-meta {
  display: flex;
  gap: 8px;
  align-items: center;
}

.doc-file-type {
  font-size: 11px;
  font-weight: 600;
  color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.doc-file-size {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.doc-card-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.doc-stat {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

/* 添加文件卡片 */
.add-file-card {
  background-color: var(--theme-bg-secondary);
  border: 2px dashed var(--theme-border);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 160px;
}

.add-file-card:hover {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.add-file-icon {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--theme-border);
  border-radius: 50%;
  font-size: 28px;
  color: var(--theme-text-secondary);
  transition: all 0.2s ease;
}

.add-file-card:hover .add-file-icon {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
  transform: rotate(90deg);
}

.add-file-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text-secondary);
}

/* 空状态 */
.empty-state,
.empty-kb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
}

.empty-kb {
  flex: 1;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3,
.empty-kb h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.empty-state p,
.empty-kb p {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 0;
}
</style>
