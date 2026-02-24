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
 * 移除单个选中的知识库
 */
function removeSelectedKB(kb: KnowledgeBase): void {
  const index = localSelectedKBs.value.findIndex((selected) => selected.id === kb.id)
  if (index >= 0) {
    localSelectedKBs.value.splice(index, 1)
    emitSelectionChange()
  }
}

/**
 * 清除所有选择
 */
function clearAllSelection(): void {
  localSelectedKBs.value = []
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
  getSelectedKBsInfo: () => localSelectedKBs.value.map(getKBInfo),
  clearSelection: clearAllSelection
})
</script>

<template>
  <div ref="panelContainerRef" class="knowledge-base-container">
    <!-- 触发按钮 -->
    <button
      class="btn kb-trigger-btn"
      :class="{ active: showPanel, 'has-selection': selectedKBsCount > 0 }"
      @click="togglePanel"
    >
      <span v-if="selectedKBsCount > 0" class="selected-kb-name">
        已选 {{ selectedKBsCount }} 个知识库
      </span>
      <span v-else>知识库</span>
      <span v-if="allKnowledgeBases.length > 0" class="kb-count">{{
        allKnowledgeBases.length
      }}</span>
      <span class="dropdown-arrow">{{ showPanel ? '▲' : '▼' }}</span>
    </button>

    <!-- 知识库面板 -->
    <div v-if="showPanel" class="kb-panel">
      <!-- 头部 -->
      <div class="panel-header">
        <span class="panel-title">知识库选择（多选）</span>
        <span class="kb-info"> {{ allKnowledgeBases.length }} 个知识库可用 </span>
      </div>

      <!-- 搜索框 -->
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          class="input search-input"
          placeholder="搜索知识库..."
        />
      </div>

      <!-- 已选知识库列表 -->
      <div v-if="selectedKBsCount > 0" class="selected-kbs-bar">
        <div class="selected-kbs-header">
          <span class="selected-label">已选择 {{ selectedKBsCount }} 个知识库:</span>
          <button class="btn btn-clear-all" @click="clearAllSelection">全部清除</button>
        </div>
        <div class="selected-kbs-list">
          <div v-for="kb in localSelectedKBs" :key="`selected-${kb.id}`" class="selected-kb-chip">
            <span class="chip-text">{{ kb.name }}</span>
            <button class="chip-remove" @click.stop="removeSelectedKB(kb)">×</button>
          </div>
        </div>
      </div>

      <!-- 全选/取消全选按钮 -->
      <div v-if="filteredKnowledgeBases.length > 0" class="select-all-bar">
        <button class="btn btn-select-all" @click="toggleSelectAll">
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
          @click="toggleKBSelection(kb)"
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
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
}

.kb-trigger-btn.has-selection {
  color: var(--theme-accent);
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
  background: linear-gradient(135deg, var(--theme-accent) 0%, var(--theme-accent-tertiary) 100%);
  color: white;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--theme-text-tertiary);
}

.kb-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  width: 420px;
  max-height: 520px;
  background:
    linear-gradient(
      135deg,
      var(--glass-white-03, rgba(255, 255, 255, 0.03)) 0%,
      var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
    ),
    linear-gradient(
      225deg,
      var(--glass-white-023, rgba(255, 255, 255, 0.023)) 0%,
      var(--glass-white-007, rgba(255, 255, 255, 0.007)) 100%
    ),
    var(--theme-bg);
  backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  -webkit-backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  border: 1px solid var(--glass-white-12, rgba(255, 255, 255, 0.12));
  border-radius: var(--theme-radius);
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.25),
    0 4px 16px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 var(--glass-white-15, rgba(255, 255, 255, 0.15));
  display: flex;
  flex-direction: column;
  z-index: 200;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
}

.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--theme-text);
}

.kb-info {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

.search-box {
  padding: 8px 12px;
  border-bottom: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
}

.search-input {
  width: 100%;
  font-size: 13px;
}

.selected-kbs-bar {
  max-height: 120px;
  overflow-y: auto;
  padding: 8px 12px;
  background: rgba(99, 102, 241, 0.06);
  border-bottom: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
  flex-shrink: 0;
}

.selected-kbs-bar::-webkit-scrollbar {
  width: 4px;
}

.selected-kbs-bar::-webkit-scrollbar-track {
  background: transparent;
}

.selected-kbs-bar::-webkit-scrollbar-thumb {
  background: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  border-radius: 2px;
}

.selected-kbs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.selected-label {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

.btn-clear-all {
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1;
}

.selected-kbs-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.selected-kb-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 8px;
  background: var(--theme-accent);
  color: white;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.2;
  max-width: 100%;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.selected-kb-chip:hover {
  background: var(--theme-accent-secondary);
}

.selected-kb-chip:active {
  transform: translateY(0);
}

.chip-text {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  flex-shrink: 0;
  border-radius: 50%;
  transition: all 0.15s;
}

.chip-remove:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.2);
}

.select-all-bar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
  background: var(--glass-white-03, rgba(255, 255, 255, 0.03));
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
  background: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  border-radius: 2px;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--theme-text-tertiary);
  font-size: 13px;
}

.kb-item {
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  border-bottom: 1px solid var(--glass-white-06, rgba(255, 255, 255, 0.06));
}

.kb-item:last-child {
  border-bottom: none;
}

.kb-item:hover {
  background: var(--glass-white-05, rgba(255, 255, 255, 0.05));
}

.kb-item.selected {
  background: rgba(99, 102, 241, 0.08);
}

.kb-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.kb-checkbox {
  font-size: 14px;
  color: var(--theme-text-tertiary);
}

.kb-item.selected .kb-checkbox {
  color: var(--theme-accent);
}

.kb-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
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
  color: var(--theme-text-tertiary);
}

.kb-description-wrapper {
  padding-left: 22px;
}

.kb-description {
  font-size: 12px;
  color: var(--theme-text-tertiary);
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
  color: var(--theme-accent);
  font-size: 11px;
  cursor: pointer;
  padding: 4px 0;
  margin-top: 4px;
  transition: opacity 0.15s;
}

.description-toggle-btn:hover {
  opacity: 0.8;
  text-decoration: underline;
}
</style>
