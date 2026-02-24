<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KnowledgeBase } from '@renderer/types'

const props = defineProps<{
  knowledgeBases: KnowledgeBase[]
  activeKbId?: string
}>()

const emit = defineEmits<{
  (e: 'select-kb', kbId: string): void
  (e: 'create-kb'): void
  (e: 'delete-kb', kbId: string): void
  (e: 'manage-files'): void
}>()

// 搜索关键词
const searchQuery = ref('')

// 过滤后的知识库列表
const filteredKBs = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.knowledgeBases
  }
  const query = searchQuery.value.toLowerCase()
  return props.knowledgeBases.filter(
    (kb) =>
      kb.name.toLowerCase().includes(query) ||
      (kb.description && kb.description.toLowerCase().includes(query))
  )
})

function handleSelectKB(kbId: string): void {
  emit('select-kb', kbId)
}

function handleCreateKB(): void {
  emit('create-kb')
}

function handleDeleteKB(kbId: string): void {
  emit('delete-kb', kbId)
}

function handleManageFiles(): void {
  emit('manage-files')
}

// 格式化文档数量
function formatDocumentCount(linkedFileIds?: string[]): string {
  const count = linkedFileIds?.length || 0
  if (count === 0) return '0 个文档'
  if (count === 1) return '1 个文档'
  return `${count} 个文档`
}
</script>

<template>
  <aside class="kb-sidebar">
    <!-- 按钮组 -->
    <div class="sidebar-actions">
      <button class="btn-primary new-kb-btn" @click="handleCreateKB">
        <span>新建知识库</span>
      </button>
      <button class="btn-secondary manage-files-btn" @click="handleManageFiles">管理文件</button>
    </div>

    <!-- 搜索框 -->
    <div class="search-container">
      <input
        v-model="searchQuery"
        type="text"
        class="input search-input"
        placeholder="搜索知识库 ..."
      />
    </div>

    <!-- 知识库列表 -->
    <div class="kb-list">
      <div
        v-for="kb in filteredKBs"
        :key="kb.id"
        :class="['kb-item', { active: kb.id === activeKbId }]"
        @click="handleSelectKB(kb.id)"
      >
        <div class="kb-icon">
          {{ kb.name.charAt(0).toUpperCase() }}
        </div>
        <div class="kb-info">
          <div class="kb-name">{{ kb.name }}</div>
          <div class="kb-meta">{{ formatDocumentCount(kb.linkedFileIds) }}</div>
        </div>
        <button class="delete-btn" title="删除知识库" @click.stop="handleDeleteKB(kb.id)">✕</button>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredKBs.length === 0" class="empty-state">
        <div class="empty-text">
          {{ searchQuery ? '未找到匹配的知识库' : '暂无知识库' }}
        </div>
        <button v-if="!searchQuery" class="btn-text" @click="handleCreateKB">
          创建第一个知识库
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.kb-sidebar {
  width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--theme-bg);
  border-right: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.new-kb-btn,
.manage-files-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin: 0;
}

.new-kb-btn {
  background: #46AA8F;
  border-color: rgba(70, 170, 143, 0.4);
}

.new-kb-btn:hover {
  background: #3d9980;
}

.manage-files-btn {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  color: var(--theme-text);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.manage-files-btn:hover {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
}

.btn-icon {
  font-size: 16px;
  font-weight: 600;
}

.search-container {
  padding: 0 12px 12px;
}

.search-input {
  width: 100%;
}

.kb-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.kb-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 4px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  position: relative;
}

.kb-item:hover {
  background-color: var(--theme-bg-hover);
}

.kb-item.active {
  background-color: var(--theme-bg-secondary);
}

.kb-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--theme-bg-hover);
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-accent);
  flex-shrink: 0;
}

.kb-info {
  flex: 1;
  min-width: 0;
}

.kb-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kb-meta {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.delete-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s ease;
}

.kb-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background-color: var(--theme-bg-hover);
  color: var(--theme-danger);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-text {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin-bottom: 16px;
}

.btn-text {
  background: transparent;
  border: 1px solid var(--theme-accent);
  color: var(--theme-accent);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-text:hover {
  background-color: var(--theme-accent);
  color: var(--theme-bg);
}
</style>
