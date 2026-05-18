<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { KnowledgeBase } from '@renderer/types'
import styles from './PaperChatKnowledgeBasePanel.module.css'

// ==================== Props 和 Emits ====================
const props = defineProps<{
  selectedKnowledgeBases?: KnowledgeBase[]
  compact?: boolean
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
      window.api.logger.error('[PaperChatKnowledgeBasePanel] 加载知识库列表失败', {
        error: result.error
      })
    }
  } catch (error) {
    window.api.logger.error('[PaperChatKnowledgeBasePanel] 加载知识库列表失败', {
      error: error instanceof Error ? error.message : String(error)
    })
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
  <div
    ref="panelContainerRef"
    :class="styles['paper-chat-knowledge']"
    :class="{ 'is-compact': props.compact }"
  >
    <!-- 触发按钮 -->
    <button
      type="button"
      :class="['btn', styles['paper-chat-knowledge__trigger']]"
      :class="{ active: showPanel, 'has-selection': selectedKBsCount > 0 }"
      :aria-expanded="showPanel"
      @click="togglePanel"
    >
      <span v-if="selectedKBsCount > 0" :class="styles['paper-chat-knowledge__selected-name']">
        已选 {{ selectedKBsCount }} 个知识库
      </span>
      <span v-else>{{ props.compact ? '知识' : '知识库' }}</span>
      <span v-if="allKnowledgeBases.length > 0" :class="styles['paper-chat-knowledge__count']">{{
        allKnowledgeBases.length
      }}</span>
      <span class="paper-chat-knowledge__dropdown-arrow" :class="{ open: showPanel }">▼</span>
    </button>

    <!-- 知识库面板 -->
    <div v-if="showPanel" :class="styles['paper-chat-knowledge-panel']">
      <!-- 头部 -->
      <div :class="styles['paper-chat-knowledge-panel__header']">
        <span :class="styles['paper-chat-knowledge-panel__title']">知识库选择（多选）</span>
        <span :class="styles['paper-chat-knowledge-panel__info']">
          {{ allKnowledgeBases.length }} 个知识库可用
        </span>
      </div>

      <!-- 搜索框 -->
      <div :class="styles['paper-chat-knowledge-panel__search']">
        <input
          v-model="searchQuery"
          type="text"
          :class="['input', styles['paper-chat-knowledge-panel__search-input']]"
          placeholder="搜索知识库..."
          aria-label="搜索知识库"
        />
      </div>

      <!-- 全选/取消全选按钮 -->
      <div
        v-if="filteredKnowledgeBases.length > 0"
        :class="styles['paper-chat-knowledge-panel__select-all-bar']"
      >
        <button
          type="button"
          :class="['btn', styles['paper-chat-knowledge-panel__select-all']]"
          @click="toggleSelectAll"
        >
          {{ isAllSelected ? '取消全选' : '全选' }}
        </button>
      </div>

      <!-- 知识库列表 -->
      <div :class="styles['paper-chat-knowledge-panel__list']">
        <div v-if="!hasKnowledgeBases" :class="styles['paper-chat-knowledge-panel__empty']">
          <p>暂无知识库，请在知识库管理页面创建</p>
        </div>
        <div
          v-else-if="filteredKnowledgeBases.length === 0"
          :class="styles['paper-chat-knowledge-panel__empty']"
        >
          <p>未找到匹配的知识库</p>
        </div>

        <div
          v-for="kb in filteredKnowledgeBases"
          :key="kb.id"
          :class="styles['paper-chat-knowledge-panel__item']"
          :class="{ selected: isKBSelected(kb) }"
          role="button"
          tabindex="0"
          :aria-selected="isKBSelected(kb)"
          @click="toggleKBSelection(kb)"
          @keydown.enter.prevent="toggleKBSelection(kb)"
          @keydown.space.prevent="toggleKBSelection(kb)"
        >
          <div :class="styles['paper-chat-knowledge-panel__item-header']">
            <span :class="styles['paper-chat-knowledge-panel__checkbox']">{{
              isKBSelected(kb) ? '☑' : '☐'
            }}</span>
            <span :class="styles['paper-chat-knowledge-panel__name']">{{ kb.name }}</span>
          </div>
          <div :class="styles['paper-chat-knowledge-panel__meta']">
            <span :class="styles['paper-chat-knowledge-panel__doc-count']">{{
              getDocumentCountText(kb)
            }}</span>
          </div>
          <div
            v-if="kb.description"
            :class="styles['paper-chat-knowledge-panel__description-wrapper']"
          >
            <div
              :ref="(el) => setDescriptionRef(kb.id, el)"
              :class="styles['paper-chat-knowledge-panel__description']"
              :class="{ expanded: isDescriptionExpanded(kb.id) }"
            >
              {{ kb.description }}
            </div>
            <button
              v-if="shouldShowExpandButton(kb.id)"
              type="button"
              :class="styles['paper-chat-knowledge-panel__description-toggle']"
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
