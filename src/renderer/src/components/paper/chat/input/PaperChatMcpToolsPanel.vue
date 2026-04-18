<script setup lang="ts">
import { ref, inject, watch, nextTick, onMounted, onUnmounted, computed, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { MCPTool } from '@renderer/types'
import { useMCPStore } from '@renderer/stores'
import { useMCPUI } from '@renderer/composables/mcp/useMCPUI'

const props = defineProps<{
  selectedTools?: MCPTool[]
  compact?: boolean
}>()

const emit = defineEmits<{
  (e: 'tools-selected', tools: MCPTool[]): void
}>()

// 注入 MCP 更新标志
const mcpUpdateKey = inject<Ref<number>>('mcpUpdateKey', ref(0))

// 直接使用 MCP Store
const mcpStore = useMCPStore()
const { statuses, searchQuery, filteredToolsByServer } = storeToRefs(mcpStore)

// 兼容旧命名
const connectionStatuses = statuses
const totalToolsCount = computed(() => mcpStore.totalToolsCount)
const connectedServersCount = computed(() => mcpStore.connectedServersCount)
const expandedServers = ref<Set<string>>(new Set())

// 本地选择状态（从 props 初始化，保持与会话同步）
const localSelectedTools = ref<MCPTool[]>(props.selectedTools ?? [])

// 同步 props 到本地状态
watch(
  () => props.selectedTools,
  (newVal) => {
    if (newVal !== undefined) {
      localSelectedTools.value = newVal
    }
  },
  { immediate: true, deep: true }
)

// 已选择的工具数量
const selectedToolsCount = computed(() => {
  return localSelectedTools.value.length
})

/**
 * 检查工具是否被选中
 */
function isToolSelected(tool: MCPTool): boolean {
  return localSelectedTools.value.some(
    (t) => t.name === tool.name && t.serverName === tool.serverName
  )
}

/**
 * 选择/取消选择工具（多选模式）
 */
function toggleTool(tool: MCPTool): void {
  const index = localSelectedTools.value.findIndex(
    (t) => t.name === tool.name && t.serverName === tool.serverName
  )

  if (index >= 0) {
    // 取消选择
    localSelectedTools.value.splice(index, 1)
  } else {
    // 添加选择
    localSelectedTools.value.push(tool)
  }

  window.api.logger.debug('[PaperChatMcpToolsPanel] 工具选择变更', {
    action: index >= 0 ? 'removed' : 'added',
    tool: `${tool.serverName}/${tool.name}`,
    selectedCount: localSelectedTools.value.length
  })
}

/**
 * 获取选中的工具列表
 */
function getSelectedTools(): MCPTool[] {
  return [...localSelectedTools.value]
}

const {
  showPanel,
  togglePanel,
  mcpContainerRef,
  toggleDescription,
  isDescriptionExpanded,
  shouldShowExpandButton,
  setDescriptionRef,
  refreshAllOverflowChecks,
  clearAllStates: clearDescriptionStates
} = useMCPUI(mcpStore.loadAllTools, expandedServers)

/**
 * 加载工具列表（包装版本，添加额外逻辑）
 */
async function loadTools(): Promise<void> {
  await mcpStore.loadAllTools()

  // 清空之前的展开状态
  clearDescriptionStates()
  expandedServers.value = new Set()

  // 默认展开所有已连接的服务器
  for (const status of connectionStatuses.value) {
    if (status.connected) {
      expandedServers.value.add(status.serverName)
    }
  }
}

/**
 * 选择/取消选择工具（包装版本，触发 emit）
 */
function handleToggleTool(tool: MCPTool): void {
  toggleTool(tool)
  emit('tools-selected', getSelectedTools())
}

/**
 * 检查指定服务分组是否已全选
 */
function isServerGroupFullySelected(tools: MCPTool[]): boolean {
  return tools.length > 0 && tools.every((tool) => isToolSelected(tool))
}

/**
 * 切换指定服务分组的工具全选状态
 */
function handleToggleServerGroupTools(tools: MCPTool[]): void {
  const allSelected = isServerGroupFullySelected(tools)

  if (allSelected) {
    localSelectedTools.value = localSelectedTools.value.filter(
      (selectedTool) =>
        !tools.some(
          (tool) => tool.name === selectedTool.name && tool.serverName === selectedTool.serverName
        )
    )
  } else {
    const selectedKeys = new Set(
      localSelectedTools.value.map((tool) => `${tool.serverName}::${tool.name}`)
    )

    for (const tool of tools) {
      const toolKey = `${tool.serverName}::${tool.name}`
      if (!selectedKeys.has(toolKey)) {
        localSelectedTools.value.push(tool)
      }
    }
  }

  emit('tools-selected', getSelectedTools())
}

/**
 * 切换服务器展开状态（包装版本，刷新溢出检查）
 */
function handleToggleServer(serverName: string): void {
  if (expandedServers.value.has(serverName)) {
    expandedServers.value.delete(serverName)
  } else {
    expandedServers.value.add(serverName)
  }

  // 展开服务器后，检查工具描述溢出状态
  if (expandedServers.value.has(serverName)) {
    nextTick(() => {
      refreshAllOverflowChecks()
    })
  }
}

// 监听搜索查询变化，重新检查溢出状态
watch(searchQuery, () => {
  nextTick(() => {
    refreshAllOverflowChecks()
  })
})

// 监听 MCP 更新
watch(mcpUpdateKey, () => {
  loadTools()
})

// 监听 MCP 状态变更
const unsubscribeMCPStatusChange = window.api.mcp.onStatusChange(() => {
  loadTools()
})

/**
 * 点击外部关闭面板
 */
function handleClickOutside(event: MouseEvent): void {
  const container = mcpContainerRef.value as HTMLElement | null
  if (showPanel.value && container && !container.contains(event.target as Node)) {
    showPanel.value = false
  }
}

// 挂载时添加全局点击监听
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

// 卸载时移除监听
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  unsubscribeMCPStatusChange()
})
</script>

<template>
  <div ref="mcpContainerRef" class="paper-chat-mcp-tools" :class="{ 'is-compact': props.compact }">
    <!-- 触发按钮 -->
    <button
      type="button"
      class="btn paper-chat-mcp-tools__trigger"
      :class="{ active: showPanel, 'has-selection': selectedToolsCount > 0 }"
      :aria-expanded="showPanel"
      @click="togglePanel"
    >
      <span v-if="selectedToolsCount > 0" class="paper-chat-mcp-tools__selected-name">
        已选 {{ selectedToolsCount }} 个工具
      </span>
      <span v-else>{{ props.compact ? 'MCP' : 'MCP 工具' }}</span>
      <span v-if="totalToolsCount > 0" class="paper-chat-mcp-tools__count">{{
        totalToolsCount
      }}</span>
      <span class="paper-chat-mcp-tools__dropdown-arrow" :class="{ open: showPanel }">▼</span>
    </button>

    <!-- 工具面板 -->
    <div v-if="showPanel" class="paper-chat-mcp-tools-panel">
      <!-- 头部 -->
      <div class="paper-chat-mcp-tools-panel__header">
        <span class="paper-chat-mcp-tools-panel__title">MCP 工具（多选）</span>
        <span class="paper-chat-mcp-tools-panel__connection-info">
          {{ connectedServersCount }} 个服务器已连接
        </span>
      </div>

      <!-- 搜索框 -->
      <div class="paper-chat-mcp-tools-panel__search">
        <input
          v-model="searchQuery"
          type="text"
          class="input paper-chat-mcp-tools-panel__search-input"
          placeholder="搜索工具..."
          aria-label="搜索 MCP 工具"
        />
      </div>

      <!-- 工具列表 -->
      <div class="paper-chat-mcp-tools-panel__tools">
        <div
          v-if="Object.keys(filteredToolsByServer).length === 0"
          class="paper-chat-mcp-tools-panel__empty"
        >
          <p v-if="searchQuery">未找到匹配的工具</p>
          <p v-else>暂无可用工具，请在设置中配置 MCP 服务器</p>
        </div>

        <div
          v-for="(tools, serverName) in filteredToolsByServer"
          :key="serverName"
          class="paper-chat-mcp-tools-panel__server"
        >
          <div
            class="paper-chat-mcp-tools-panel__server-header"
            role="button"
            tabindex="0"
            :aria-expanded="expandedServers.has(serverName as string)"
            @click="handleToggleServer(serverName as string)"
            @keydown.enter.prevent="handleToggleServer(serverName as string)"
            @keydown.space.prevent="handleToggleServer(serverName as string)"
          >
            <span class="paper-chat-mcp-tools-panel__expand-icon">{{
              expandedServers.has(serverName as string) ? '▼' : '▶'
            }}</span>
            <span class="paper-chat-mcp-tools-panel__server-name">{{ serverName }}</span>
            <button
              type="button"
              class="btn paper-chat-mcp-tools-panel__server-select-all"
              @click.stop="handleToggleServerGroupTools(tools)"
            >
              {{ isServerGroupFullySelected(tools) ? '取消全选' : '全选' }}
            </button>
            <span
              class="paper-chat-mcp-tools-panel__server-status"
              :class="{ connected: mcpStore.isServerConnected(serverName as string) }"
            >
              {{ mcpStore.isServerConnected(serverName as string) ? '●' : '○' }}
            </span>
            <span class="paper-chat-mcp-tools__count-badge">{{ tools.length }}</span>
          </div>

          <div
            v-if="expandedServers.has(serverName as string)"
            class="paper-chat-mcp-tools-panel__server-tools"
          >
            <div
              v-for="tool in tools"
              :id="`tool-${serverName}-${tool.name}`"
              :key="`${serverName}-${tool.name}`"
              class="paper-chat-mcp-tools-panel__tool"
              :class="{ selected: isToolSelected(tool) }"
              role="button"
              tabindex="0"
              :aria-selected="isToolSelected(tool)"
              @click="handleToggleTool(tool)"
              @keydown.enter.prevent="handleToggleTool(tool)"
              @keydown.space.prevent="handleToggleTool(tool)"
            >
              <div class="paper-chat-mcp-tools-panel__tool-header">
                <span class="paper-chat-mcp-tools-panel__tool-checkbox">{{
                  isToolSelected(tool) ? '☑' : '☐'
                }}</span>
                <span class="paper-chat-mcp-tools-panel__tool-name">{{ tool.name }}</span>
              </div>
              <div
                v-if="tool.description"
                class="paper-chat-mcp-tools-panel__tool-description-wrapper"
              >
                <div
                  :ref="(el) => setDescriptionRef(tool, el)"
                  class="paper-chat-mcp-tools-panel__tool-description"
                  :class="{ expanded: isDescriptionExpanded(tool) }"
                >
                  {{ tool.description }}
                </div>
                <button
                  v-if="shouldShowExpandButton(tool)"
                  type="button"
                  class="paper-chat-mcp-tools-panel__description-toggle"
                  @click.stop="toggleDescription(tool)"
                >
                  {{ isDescriptionExpanded(tool) ? '收起' : '展开' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paper-chat-mcp-tools {
  position: relative;
}

.paper-chat-mcp-tools.is-compact .paper-chat-mcp-tools__trigger {
  min-height: 32px;
  padding: 6px 10px;
}

.paper-chat-mcp-tools.is-compact .paper-chat-mcp-tools__selected-name {
  max-width: 56px;
}

.paper-chat-mcp-tools.is-compact .paper-chat-mcp-tools-panel {
  width: min(320px, calc(100vw - 48px));
  max-height: 420px;
}

.paper-chat-mcp-tools__trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
}

.paper-chat-mcp-tools__trigger.active {
  background: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
}

.paper-chat-mcp-tools__trigger.has-selection {
  color: var(--sm-color-text-primary);
}

.paper-chat-mcp-tools__selected-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--sm-font-mono);
  font-size: 12px;
}

.paper-chat-mcp-tools__count {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--sm-color-surface-selected);
  border: 1px solid var(--sm-color-border-selected);
  color: var(--sm-color-text-primary);
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.paper-chat-mcp-tools__dropdown-arrow {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
}

.paper-chat-mcp-tools__dropdown-arrow.open {
  transform: rotate(180deg);
}

.paper-chat-mcp-tools-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  width: 400px;
  max-height: 480px;
  background: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  display: flex;
  flex-direction: column;
  z-index: 200;
}

.paper-chat-mcp-tools-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.paper-chat-mcp-tools-panel__title {
  font-weight: 600;
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.paper-chat-mcp-tools-panel__connection-info {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.paper-chat-mcp-tools-panel__search {
  padding: 8px 12px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.paper-chat-mcp-tools-panel__search-input {
  width: 100%;
  font-size: 13px;
}

.paper-chat-mcp-tools-panel__tools {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  min-height: 120px;
}

.paper-chat-mcp-tools-panel__tools::-webkit-scrollbar {
  width: 4px;
}

.paper-chat-mcp-tools-panel__tools::-webkit-scrollbar-track {
  background: transparent;
}

.paper-chat-mcp-tools-panel__tools::-webkit-scrollbar-thumb {
  background: var(--sm-color-border-default);
  border-radius: 999px;
}

.paper-chat-mcp-tools-panel__empty {
  padding: 24px;
  text-align: center;
  color: var(--sm-color-text-tertiary);
  font-size: 13px;
}

.paper-chat-mcp-tools-panel__server {
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.paper-chat-mcp-tools-panel__server:last-child {
  border-bottom: none;
}

.paper-chat-mcp-tools-panel__server-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color var(--sm-transition-fast);
}

.paper-chat-mcp-tools-panel__server-header:hover {
  background: var(--sm-color-surface-hover);
}

.paper-chat-mcp-tools-panel__server-header:focus-visible {
  background: var(--sm-color-surface-hover);
}

.paper-chat-mcp-tools-panel__expand-icon {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  margin-right: 8px;
  width: 12px;
}

.paper-chat-mcp-tools-panel__server-name {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.paper-chat-mcp-tools-panel__server-select-all {
  padding: 2px 8px;
  margin-right: 8px;
  font-size: 11px;
  line-height: 1;
}

.paper-chat-mcp-tools-panel__server-status {
  margin-right: 8px;
  color: var(--sm-color-text-tertiary);
}

.paper-chat-mcp-tools-panel__server-status.connected {
  color: var(--sm-color-status-success);
}

.paper-chat-mcp-tools__count-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-subtle);
  color: var(--sm-color-text-tertiary);
  border-radius: 10px;
}

.paper-chat-mcp-tools-panel__server-tools {
  padding: 2px 0;
}

.paper-chat-mcp-tools-panel__tool {
  padding: 8px 16px 8px 36px;
  cursor: pointer;
  transition: background-color var(--sm-transition-fast);
}

.paper-chat-mcp-tools-panel__tool:hover {
  background: var(--sm-color-surface-1);
}

.paper-chat-mcp-tools-panel__tool.selected {
  background: var(--sm-color-surface-selected);
}

.paper-chat-mcp-tools-panel__tool:focus-visible {
  background: var(--sm-color-surface-1);
}

.paper-chat-mcp-tools-panel__tool.highlight {
  animation: highlight-pulse 0.48s ease-out;
}

@keyframes highlight-pulse {
  0% {
    background-color: var(--sm-color-surface-selected-hover);
  }
  100% {
    background-color: var(--sm-color-surface-selected);
  }
}

.paper-chat-mcp-tools-panel__tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.paper-chat-mcp-tools-panel__tool-checkbox {
  font-size: 14px;
  color: var(--sm-color-text-tertiary);
}

.paper-chat-mcp-tools-panel__tool.selected .paper-chat-mcp-tools-panel__tool-checkbox {
  color: var(--sm-color-text-primary);
}

.paper-chat-mcp-tools-panel__tool-name {
  font-size: 13px;
  font-family: var(--sm-font-mono);
  color: var(--sm-color-text-primary);
}

.paper-chat-mcp-tools-panel__tool-description-wrapper {
  margin-top: 6px;
}

.paper-chat-mcp-tools-panel__tool-description {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.paper-chat-mcp-tools-panel__tool-description.expanded {
  -webkit-line-clamp: unset;
  line-clamp: unset;
  display: block;
}

.paper-chat-mcp-tools-panel__description-toggle {
  background: none;
  border: none;
  color: var(--sm-color-accent-hover);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 0;
  margin-top: 4px;
  transition: opacity var(--sm-transition-fast);
}

.paper-chat-mcp-tools-panel__description-toggle:hover {
  opacity: 0.8;
  text-decoration: underline;
}
</style>
