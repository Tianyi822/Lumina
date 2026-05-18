<script setup lang="ts">
import { ref, computed } from 'vue'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { KnowledgeBase } from '@renderer/types'
import styles from './KnowledgeSidebar.module.css'

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

function needsReindex(kb: KnowledgeBase): boolean {
  return kb.indexInvalidation?.needsReindex === true
}
</script>

<template>
  <aside :class="[styles['kb-sidebar'], 'sm-sidebar-shell']">
    <WorkspaceSidebarChrome :count="knowledgeBases.length">
      <template #actions>
        <button
          :class="['sm-button', 'sm-button--primary', styles['new-kb-btn']]"
          @click="handleCreateKB"
        >
          新建知识库
        </button>
        <button
          :class="['sm-button', 'sm-button--secondary', styles['manage-files-btn']]"
          @click="handleManageFiles"
        >
          管理文件
        </button>
      </template>
    </WorkspaceSidebarChrome>

    <div :class="['sm-sidebar-shell__search', styles['search-container']]">
      <input
        v-model="searchQuery"
        type="text"
        :class="['sm-input', styles['search-input']]"
        placeholder="搜索知识库"
      />
    </div>

    <div class="sm-sidebar-shell__body sm-sidebar-shell__body--flush">
      <div :class="styles['kb-list']">
        <div
          v-for="kb in filteredKBs"
          :key="kb.id"
          :class="[styles['kb-item'], { [styles.active]: kb.id === activeKbId }]"
          @click="handleSelectKB(kb.id)"
        >
          <div :class="styles['kb-icon']">
            {{ kb.name.charAt(0).toUpperCase() }}
          </div>
          <div :class="styles['kb-info']">
            <div :class="styles['kb-name-row']">
              <div :class="styles['kb-name']">{{ kb.name }}</div>
              <span v-if="needsReindex(kb)" :class="styles['kb-stale-badge']">需重索引</span>
            </div>
            <div :class="styles['kb-meta']">{{ formatDocumentCount(kb.linkedFileIds) }}</div>
          </div>
          <button
            :class="styles['delete-btn']"
            title="删除知识库"
            @click.stop="handleDeleteKB(kb.id)"
          >
            <SvgIcon name="trash" :size="14" />
          </button>
        </div>

        <div v-if="filteredKBs.length === 0" :class="styles['empty-state']">
          <div :class="styles['empty-text']">
            {{ searchQuery ? '未找到匹配的知识库' : '暂无知识库' }}
          </div>
          <button v-if="!searchQuery" :class="styles['btn-text']" @click="handleCreateKB">
            创建第一个知识库
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
