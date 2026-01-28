<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KnowledgeBase, Document } from '@renderer/types'

const props = defineProps<{
  knowledgeBase?: KnowledgeBase
}>()

const emit = defineEmits<{
  (e: 'upload-documents'): void
  (e: 'search', query: string): void
}>()

// 当前活动标签页
type TabType = 'documents' | 'search'
const activeTab = ref<TabType>('documents')

// 搜索查询
const searchQuery = ref('')

// 模拟文档数据（实际应从后端获取）
const mockDocuments = ref<Document[]>([
  {
    id: 'doc-1',
    kbId: 'kb-1',
    name: '产品介绍.md',
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
    name: 'API 文档.txt',
    fileType: 'txt',
    fileSize: 4096,
    chunkCount: 24,
    status: 'completed',
    createdAt: '2024-01-15T11:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z'
  }
])

// 模拟搜索结果
const mockSearchResults = ref<any[]>([])

const currentKB = computed(() => props.knowledgeBase)

function handleTabChange(tab: TabType): void {
  activeTab.value = tab
}

function handleUpload(): void {
  emit('upload-documents')
}

function handleSearch(): void {
  if (searchQuery.value.trim()) {
    emit('search', searchQuery.value)
    // 模拟搜索结果
    mockSearchResults.value = [
      {
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        documentName: '产品介绍.md',
        content: '这是一个示例搜索结果片段...',
        score: 0.95,
        distance: 0.05
      }
    ]
  }
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
        <div class="kb-title-section">
          <h1 class="kb-title">{{ currentKB.name }}</h1>
          <p v-if="currentKB.description" class="kb-description">
            {{ currentKB.description }}
          </p>
        </div>
        <div class="kb-actions">
          <button class="btn" @click="handleUpload">📄 上传文档</button>
        </div>
      </header>

      <!-- 标签页切换 -->
      <div class="tab-container">
        <button
          :class="['tab-btn', { active: activeTab === 'documents' }]"
          @click="handleTabChange('documents')"
        >
          文档列表
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'search' }]"
          @click="handleTabChange('search')"
        >
          语义搜索
        </button>
      </div>

      <!-- 文档列表标签页 -->
      <div v-if="activeTab === 'documents'" class="tab-content">
        <div class="documents-list">
          <div v-for="doc in mockDocuments" :key="doc.id" class="document-item">
            <div class="doc-icon">
              {{ doc.fileType === 'md' ? '📝' : '📄' }}
            </div>
            <div class="doc-info">
              <div class="doc-name">{{ doc.name }}</div>
              <div class="doc-meta">
                {{ formatFileSize(doc.fileSize) }} · {{ doc.chunkCount }} 个分块 ·
                {{ formatDate(doc.createdAt) }}
              </div>
            </div>
            <div :class="['doc-status', doc.status]">
              {{ doc.status === 'completed' ? '✓ 已完成' : '处理中' }}
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="mockDocuments.length === 0" class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>暂无文档</h3>
            <p>点击上方"上传文档"按钮添加文档到知识库</p>
          </div>
        </div>
      </div>

      <!-- 搜索标签页 -->
      <div v-if="activeTab === 'search'" class="tab-content">
        <div class="search-section">
          <div class="search-box">
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="输入问题进行语义搜索..."
              @keypress.enter="handleSearch"
            />
            <button class="btn-primary search-btn" @click="handleSearch">🔍 搜索</button>
          </div>

          <!-- 搜索结果 -->
          <div v-if="mockSearchResults.length > 0" class="search-results">
            <div class="results-header">
              <h3>搜索结果</h3>
              <span class="results-count">找到 {{ mockSearchResults.length }} 条相关内容</span>
            </div>
            <div class="result-list">
              <div v-for="result in mockSearchResults" :key="result.chunkId" class="result-item">
                <div class="result-meta">
                  <span class="result-doc">{{ result.documentName }}</span>
                  <span class="result-score">相关度: {{ (result.score * 100).toFixed(0) }}%</span>
                </div>
                <div class="result-content">{{ result.content }}</div>
                <button class="btn-text copy-btn">📋 复制</button>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else-if="searchQuery" class="empty-state">
            <div class="empty-icon">🔍</div>
            <h3>未找到相关内容</h3>
            <p>尝试使用不同的关键词搜索</p>
          </div>

          <!-- 初始状态 -->
          <div v-else class="empty-state">
            <div class="empty-icon">🔎</div>
            <h3>语义搜索</h3>
            <p>输入问题或关键词，从知识库中查找相关内容</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态（未选择知识库） -->
    <div v-else class="empty-kb">
      <div class="empty-icon">📚</div>
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
  padding: 20px 24px;
  border-bottom: 1px solid var(--theme-border);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.kb-title-section {
  flex: 1;
  min-width: 0;
}

.kb-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
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

/* 标签页 */
.tab-container {
  display: flex;
  gap: 8px;
  padding: 16px 24px 0;
  border-bottom: 1px solid var(--theme-border);
}

.tab-btn {
  background: transparent;
  border: none;
  padding: 8px 16px;
  font-size: 14px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: var(--theme-text);
}

.tab-btn.active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* 文档列表 */
.documents-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.document-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.document-item:hover {
  border-color: var(--theme-text-secondary);
}

.doc-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--theme-bg-hover);
  border-radius: 8px;
  flex-shrink: 0;
}

.doc-info {
  flex: 1;
  min-width: 0;
}

.doc-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 4px;
}

.doc-meta {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.doc-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

.doc-status.completed {
  background-color: rgba(63, 185, 80, 0.1);
  color: var(--theme-success);
}

.doc-status.processing,
.doc-status.pending {
  background-color: rgba(210, 153, 34, 0.1);
  color: var(--theme-warning);
}

.doc-status.failed {
  background-color: rgba(248, 81, 73, 0.1);
  color: var(--theme-danger);
}

/* 搜索区域 */
.search-section {
  max-width: 800px;
  margin: 0 auto;
}

.search-box {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.search-input {
  flex: 1;
  padding: 12px 16px;
  font-size: 14px;
}

.search-btn {
  padding: 12px 24px;
  white-space: nowrap;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--theme-border);
}

.results-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.results-count {
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  padding: 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.result-item:hover {
  border-color: var(--theme-accent);
}

.result-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.result-doc {
  font-size: 12px;
  color: var(--theme-text-secondary);
  font-weight: 500;
}

.result-score {
  font-size: 12px;
  color: var(--theme-accent);
}

.result-content {
  font-size: 14px;
  color: var(--theme-text);
  line-height: 1.6;
  margin-bottom: 12px;
}

.copy-btn {
  font-size: 12px;
  padding: 4px 12px;
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
