<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { KnowledgeBase } from '@renderer/types'

// ==================== Props 和 Emits ====================
const props = defineProps<{
  selectedKnowledgeBases?: KnowledgeBase[]
}>()

const emit = defineEmits<{
  (e: 'selection-change', knowledgeBases: KnowledgeBase[]): void
}>()

// ==================== 本地状态 ====================
const localSelectedKBs = ref<KnowledgeBase[]>(props.selectedKnowledgeBases ?? [])
const allKnowledgeBases = ref<KnowledgeBase[]>([])
const showPanel = ref(false)
const panelContainerRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')

// 简介展开状态管理
const expandedDescriptions = ref<Set<string>>(new Set())
const descriptionRefs = ref<Map<string, HTMLElement>>(new Map())
const needsExpandButton = ref<Map<string, boolean>>(new Map())

// ==================== 同步 Props 到本地状态 ====================
watch(
  () => props.selectedKnowledgeBases,
  (newVal) => {
    if (newVal !== undefined) {
      localSelectedKBs.value = newVal
    }
  },
  { immediate: true, deep: true }
)

// ==================== 计算属性 ====================
const selectedKBsCount = computed(() => localSelectedKBs.value.length)

const filteredKnowledgeBases = computed(() => {
  if (!searchQuery.value.trim()) {
    return allKnowledgeBases.value
  }
  const query = searchQuery.value.toLowerCase()
  return allKnowledgeBases.value.filter(
    (kb) =>
      kb.name.toLowerCase().includes(query) ||
      (kb.description && kb.description.toLowerCase().includes(query))
  )
})

const hasKnowledgeBases = computed(() => allKnowledgeBases.value.length > 0)

const isAllSelected = computed(() => {
  if (filteredKnowledgeBases.value.length === 0) return false
  return filteredKnowledgeBases.value.every((kb) => isKBSelected(kb))
})

// ==================== 方法 ====================
/**
 * 加载知识库列表
 */
async function loadKnowledgeBases(): Promise<void> {
  try {
    const result = await window.api.knowledge.getAll()
    if (result.success && result.data) {
      allKnowledgeBases.value = result.data
    } else {
      console.error('加载知识库列表失败:', result.error)
    }
  } catch (error) {
    console.error('加载知识库列表出错:', error)
  }
}

/**
 * 检查知识库是否被选中
 */
function isKBSelected(kb: KnowledgeBase): boolean {
  return localSelectedKBs.value.some((selected) => selected.id === kb.id)
}

/**
 * 切换知识库选择状态
 */
function toggleKBSelection(kb: KnowledgeBase): void {
  const index = localSelectedKBs.value.findIndex((selected) => selected.id === kb.id)
  if (index >= 0) {
    localSelectedKBs.value.splice(index, 1)
  } else {
    localSelectedKBs.value.push(kb)
  }
  emitSelectionChange()
}

/**
 * 全选/取消全选
 */
function toggleSelectAll(): void {
  if (isAllSelected.value) {
    // 取消全选（只取消当前过滤结果的选中状态）
    const filteredIds = new Set(filteredKnowledgeBases.value.map((kb) => kb.id))
    localSelectedKBs.value = localSelectedKBs.value.filter((kb) => !filteredIds.has(kb.id))
  } else {
    // 全选（添加当前过滤结果中未选中的）
    const selectedIds = new Set(localSelectedKBs.value.map((kb) => kb.id))
    for (const kb of filteredKnowledgeBases.value) {
      if (!selectedIds.has(kb.id)) {
        localSelectedKBs.value.push(kb)
      }
    }
  }
  emitSelectionChange()
}

/**
 * 触发选择变更事件
 */
function emitSelectionChange(): void {
  emit('selection-change', [...localSelectedKBs.value])
}

/**
 * 切换面板显示
 */
function togglePanel(): void {
  showPanel.value = !showPanel.value
  if (showPanel.value) {
    loadKnowledgeBases()
    nextTick(() => {
      refreshAllOverflowChecks()
    })
  }
}

/**
 * 检查是否需要显示展开按钮
 */
function checkNeedsExpand(kbId: string): boolean {
  const el = descriptionRefs.value.get(kbId)
  if (!el) return false
  // 检查内容是否被截断
  return el.scrollHeight > el.clientHeight
}

/**
 * 设置描述元素引用
 */
function setDescriptionRef(kbId: string, el: unknown): void {
  if (el instanceof HTMLElement) {
    descriptionRefs.value.set(kbId, el)
    // 延迟检查是否需要展开按钮
    nextTick(() => {
      needsExpandButton.value.set(kbId, checkNeedsExpand(kbId))
    })
  }
}

/**
 * 切换简介展开状态
 */
function toggleDescription(kbId: string): void {
  if (expandedDescriptions.value.has(kbId)) {
    expandedDescriptions.value.delete(kbId)
  } else {
    expandedDescriptions.value.add(kbId)
  }
}

/**
 * 检查简介是否已展开
 */
function isDescriptionExpanded(kbId: string): boolean {
  return expandedDescriptions.value.has(kbId)
}

/**
 * 检查是否需要显示展开按钮
 */
function shouldShowExpandButton(kbId: string): boolean {
  return needsExpandButton.value.get(kbId) ?? false
}

/**
 * 刷新所有溢出检查
 */
function refreshAllOverflowChecks(): void {
  for (const kb of allKnowledgeBases.value) {
    needsExpandButton.value.set(kb.id, checkNeedsExpand(kb.id))
  }
}

/**
 * 获取文档数量显示文本
 */
function getDocumentCountText(kb: KnowledgeBase): string {
  const count = kb.linkedFileIds?.length ?? kb.documentCount ?? 0
  return `${count} 个文档`
}

/**
 * 获取知识库信息摘要（用于提示）
 */
function getKBInfo(kb: KnowledgeBase): {
  name: string
  description: string
  documentCount: number
} {
  return {
    name: kb.name,
    description: kb.description || '',
    documentCount: kb.linkedFileIds?.length ?? kb.documentCount ?? 0
  }
}

/**
 * 处理点击外部关闭面板
 */
function handleClickOutside(event: MouseEvent): void {
  const container = panelContainerRef.value
  if (showPanel.value && container && !container.contains(event.target as Node)) {
    showPanel.value = false
  }
}

// ==================== 生命周期 ====================
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

// 监听搜索变化，重新检查溢出
watch(searchQuery, () => {
  nextTick(() => {
    refreshAllOverflowChecks()
  })
})

// 暴露方法给父组件
defineExpose({
  getSelectedKBsInfo: () => localSelectedKBs.value.map(getKBInfo)
})
</script>

<template>
  <div ref="panelContainerRef" class="knowledge-base-container">
    <!-- 触发按钮 -->
    <button
      type="button"
      class="btn kb-trigger-btn"
      :class="{ active: showPanel, 'has-selection': selectedKBsCount > 0 }"
      :aria-expanded="showPanel"
      @click="togglePanel"
    >
      <span v-if="selectedKBsCount > 0" class="selected-kb-name">
        已选 {{ selectedKBsCount }} 个知识库
      </span>
      <span v-else>知识库</span>
      <span v-if="allKnowledgeBases.length > 0" class="kb-count">{{
        allKnowledgeBases.length
      }}</span>
      <span class="dropdown-arrow" :class="{ open: showPanel }">▼</span>
    </button>

    <!-- 知识库面板 -->
    <div v-if="showPanel" class="kb-panel">
      <!-- 头部 -->
      <div class="sm-knowledge-base__header">
        <span class="sm-knowledge-base__title">知识库选择（多选）</span>
        <span class="kb-info"> {{ allKnowledgeBases.length }} 个知识库可用 </span>
      </div>

      <!-- 搜索框 -->
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          class="input search-input"
          placeholder="搜索知识库..."
          aria-label="搜索知识库"
        />
      </div>

      <!-- 全选/取消全选按钮 -->
      <div v-if="filteredKnowledgeBases.length > 0" class="select-all-bar">
        <button type="button" class="btn btn-select-all" @click="toggleSelectAll">
          {{ isAllSelected ? '取消全选' : '全选' }}
        </button>
      </div>

      <!-- 知识库列表 -->
      <div class="kb-list-container">
        <div v-if="!hasKnowledgeBases" class="empty-state">
          <p>暂无知识库，请在知识库管理页面创建</p>
        </div>
        <div v-else-if="filteredKnowledgeBases.length === 0" class="empty-state">
          <p>未找到匹配的知识库</p>
        </div>

        <div
          v-for="kb in filteredKnowledgeBases"
          :key="kb.id"
          class="kb-item"
          :class="{ selected: isKBSelected(kb) }"
          role="button"
          tabindex="0"
          :aria-selected="isKBSelected(kb)"
          @click="toggleKBSelection(kb)"
          @keydown.enter.prevent="toggleKBSelection(kb)"
          @keydown.space.prevent="toggleKBSelection(kb)"
        >
          <div class="kb-header">
            <span class="kb-checkbox">{{ isKBSelected(kb) ? '☑' : '☐' }}</span>
            <span class="kb-name">{{ kb.name }}</span>
          </div>
          <div class="kb-meta">
            <span class="kb-doc-count">{{ getDocumentCountText(kb) }}</span>
          </div>
          <div v-if="kb.description" class="kb-description-wrapper">
            <div
              :ref="(el) => setDescriptionRef(kb.id, el)"
              class="kb-description"
              :class="{ expanded: isDescriptionExpanded(kb.id) }"
            >
              {{ kb.description }}
            </div>
            <button
              v-if="shouldShowExpandButton(kb.id)"
              type="button"
              class="description-toggle-btn"
              @click.stop="toggleDescription(kb.id)"
            >
              {{ isDescriptionExpanded(kb.id) ? '收起' : '展开' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.knowledge-base-container {
  position: relative;
}

.kb-trigger-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
}

.kb-trigger-btn.active {
  background: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
}

.kb-trigger-btn.has-selection {
  color: var(--sm-color-text-primary);
}

.selected-kb-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.kb-count {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--sm-color-surface-selected);
  border: 1px solid var(--sm-color-border-selected);
  color: var(--sm-color-text-primary);
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.kb-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  width: 420px;
  max-height: 520px;
  background: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  display: flex;
  flex-direction: column;
  z-index: 200;
}

.sm-knowledge-base__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.sm-knowledge-base__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.kb-info {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.search-box {
  padding: 8px 12px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.search-input {
  width: 100%;
  font-size: 13px;
}

.select-all-bar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
}

.btn-select-all {
  padding: 4px 12px;
  font-size: 12px;
  width: 100%;
}

.kb-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  min-height: 120px;
}

.kb-list-container::-webkit-scrollbar {
  width: 4px;
}

.kb-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.kb-list-container::-webkit-scrollbar-thumb {
  background: var(--sm-color-border-default);
  border-radius: 999px;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--sm-color-text-tertiary);
  font-size: 13px;
}

.kb-item {
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color var(--sm-transition-fast);
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.kb-item:last-child {
  border-bottom: none;
}

.kb-item:hover {
  background: var(--sm-color-surface-1);
}

.kb-item.selected {
  background: var(--sm-color-surface-selected);
}

.kb-item:focus-visible {
  background: var(--sm-color-surface-1);
}

.kb-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.kb-checkbox {
  font-size: 14px;
  color: var(--sm-color-text-tertiary);
}

.kb-item.selected .kb-checkbox {
  color: var(--sm-color-text-primary);
}

.kb-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.kb-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
  padding-left: 22px;
}

.kb-doc-count {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.kb-description-wrapper {
  padding-left: 22px;
}

.kb-description {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kb-description.expanded {
  -webkit-line-clamp: unset;
  line-clamp: unset;
  display: block;
}

.description-toggle-btn {
  background: none;
  border: none;
  color: var(--sm-color-accent-hover);
  font-size: 11px;
  cursor: pointer;
  padding: 4px 0;
  margin-top: 4px;
  transition: opacity var(--sm-transition-fast);
}

.description-toggle-btn:hover {
  opacity: 0.8;
  text-decoration: underline;
}
</style>
