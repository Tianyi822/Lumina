<script setup lang="ts">
import { ref, computed } from 'vue'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
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
  <aside class="kb-sidebar sm-sidebar-shell">
    <WorkspaceSidebarChrome :count="knowledgeBases.length">
      <template #actions>
        <button class="sm-button sm-button--primary new-kb-btn" @click="handleCreateKB">
          新建知识库
        </button>
        <button class="sm-button sm-button--secondary manage-files-btn" @click="handleManageFiles">
          管理文件
        </button>
      </template>
    </WorkspaceSidebarChrome>

    <div class="sm-sidebar-shell__search search-container">
      <input
        v-model="searchQuery"
        type="text"
        class="sm-input search-input"
        placeholder="搜索知识库"
      />
    </div>

    <div class="sm-sidebar-shell__body sm-sidebar-shell__body--flush">
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
          <button class="delete-btn" title="删除知识库" @click.stop="handleDeleteKB(kb.id)">
            <SvgIcon name="trash" :size="14" />
          </button>
        </div>

        <div v-if="filteredKBs.length === 0" class="empty-state">
          <div class="empty-text">
            {{ searchQuery ? '未找到匹配的知识库' : '暂无知识库' }}
          </div>
          <button v-if="!searchQuery" class="btn-text" @click="handleCreateKB">
            创建第一个知识库
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.kb-sidebar {
  min-height: 0;
}

.new-kb-btn,
.manage-files-btn {
  width: 100%;
  min-height: 36px;
}

.search-container {
  display: flex;
}

.search-input {
  width: 100%;
}

.kb-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.kb-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
  position: relative;
}

.kb-item:hover {
  background-color: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.kb-item.active {
  background-color: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
}

.kb-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  flex-shrink: 0;
}

.kb-info {
  flex: 1;
  min-width: 0;
}

.kb-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kb-meta {
  font-size: 11px;
  color: var(--sm-color-text-secondary);
}

.delete-btn {
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
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
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: rgba(199, 120, 120, 0.92);
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
  color: var(--sm-color-text-secondary);
  margin-bottom: 16px;
}

.btn-text {
  background: transparent;
  border: 1px solid var(--sm-color-border-accent);
  color: var(--sm-color-text-primary);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-text:hover {
  background-color: var(--sm-color-surface-selected-hover);
  border-color: var(--sm-color-border-selected);
}
</style>
