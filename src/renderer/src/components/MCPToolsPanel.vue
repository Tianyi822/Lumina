<script setup lang="ts">
import { ref, inject, watch, nextTick, onMounted, onUnmounted, computed, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { MCPTool } from '@renderer/types'
import { useMCPStore } from '@renderer/stores'
import { useMCPUI } from '@renderer/composables/mcp/useMCPUI'

const props = defineProps<{
  selectedTools?: MCPTool[]
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

  window.api.logger.debug('[MCPToolsPanel] 工具选择变更', {
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
  <div ref="mcpContainerRef" class="mcp-tools-container">
    <!-- 触发按钮 -->
    <button
      type="button"
      class="btn mcp-trigger-btn"
      :class="{ active: showPanel, 'has-selection': selectedToolsCount > 0 }"
      :aria-expanded="showPanel"
      @click="togglePanel"
    >
      <span v-if="selectedToolsCount > 0" class="selected-tool-name">
        已选 {{ selectedToolsCount }} 个工具
      </span>
      <span v-else>MCP 工具</span>
      <span v-if="totalToolsCount > 0" class="tools-count">{{ totalToolsCount }}</span>
      <span class="dropdown-arrow" :class="{ open: showPanel }">▼</span>
    </button>

    <!-- 工具面板 -->
    <div v-if="showPanel" class="mcp-tools-panel">
      <!-- 头部 -->
      <div class="panel-header">
        <span class="panel-title">MCP 工具（多选）</span>
        <span class="connection-info"> {{ connectedServersCount }} 个服务器已连接 </span>
      </div>

      <!-- 搜索框 -->
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          class="input search-input"
          placeholder="搜索工具..."
          aria-label="搜索 MCP 工具"
        />
      </div>

      <!-- 工具列表 -->
      <div class="tools-container">
        <div v-if="Object.keys(filteredToolsByServer).length === 0" class="empty-state">
          <p v-if="searchQuery">未找到匹配的工具</p>
          <p v-else>暂无可用工具，请在设置中配置 MCP 服务器</p>
        </div>

        <div
          v-for="(tools, serverName) in filteredToolsByServer"
          :key="serverName"
          class="server-group"
        >
          <div
            class="server-header"
            role="button"
            tabindex="0"
            :aria-expanded="expandedServers.has(serverName as string)"
            @click="handleToggleServer(serverName as string)"
            @keydown.enter.prevent="handleToggleServer(serverName as string)"
            @keydown.space.prevent="handleToggleServer(serverName as string)"
          >
            <span class="expand-icon">{{
              expandedServers.has(serverName as string) ? '▼' : '▶'
            }}</span>
            <span class="server-name">{{ serverName }}</span>
            <button
              type="button"
              class="btn server-select-all-btn"
              @click.stop="handleToggleServerGroupTools(tools)"
            >
              {{ isServerGroupFullySelected(tools) ? '取消全选' : '全选' }}
            </button>
            <span
              class="server-status"
              :class="{ connected: mcpStore.isServerConnected(serverName as string) }"
            >
              {{ mcpStore.isServerConnected(serverName as string) ? '●' : '○' }}
            </span>
            <span class="tools-count-badge">{{ tools.length }}</span>
          </div>

          <div v-if="expandedServers.has(serverName as string)" class="server-tools">
            <div
              v-for="tool in tools"
              :id="`tool-${serverName}-${tool.name}`"
              :key="`${serverName}-${tool.name}`"
              class="tool-item"
              :class="{ selected: isToolSelected(tool) }"
              role="button"
              tabindex="0"
              :aria-selected="isToolSelected(tool)"
              @click="handleToggleTool(tool)"
              @keydown.enter.prevent="handleToggleTool(tool)"
              @keydown.space.prevent="handleToggleTool(tool)"
            >
              <div class="tool-header">
                <span class="tool-checkbox">{{ isToolSelected(tool) ? '☑' : '☐' }}</span>
                <span class="tool-name">{{ tool.name }}</span>
              </div>
              <div v-if="tool.description" class="tool-description-wrapper">
                <div
                  :ref="(el) => setDescriptionRef(tool, el)"
                  class="tool-description"
                  :class="{ expanded: isDescriptionExpanded(tool) }"
                >
                  {{ tool.description }}
                </div>
                <button
                  v-if="shouldShowExpandButton(tool)"
                  type="button"
                  class="description-toggle-btn"
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
.mcp-tools-container {
  position: relative;
}

.mcp-trigger-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
}

.mcp-trigger-btn.active {
  background: rgba(142, 149, 217, 0.08);
  border-color: var(--sm-color-border-accent);
}

.mcp-trigger-btn.has-selection {
  color: var(--sm-color-accent-hover);
}

.selected-tool-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--sm-font-mono);
  font-size: 12px;
}

.tools-count {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-accent);
  color: var(--sm-color-accent-hover);
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

.mcp-tools-panel {
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

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.connection-info {
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

.tools-container {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  min-height: 120px;
}

.tools-container::-webkit-scrollbar {
  width: 4px;
}

.tools-container::-webkit-scrollbar-track {
  background: transparent;
}

.tools-container::-webkit-scrollbar-thumb {
  background: var(--sm-color-border-default);
  border-radius: 999px;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--sm-color-text-tertiary);
  font-size: 13px;
}

.server-group {
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.server-group:last-child {
  border-bottom: none;
}

.server-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color var(--sm-transition-fast);
}

.server-header:hover {
  background: var(--sm-color-surface-hover);
}

.server-header:focus-visible {
  background: var(--sm-color-surface-hover);
}

.expand-icon {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  margin-right: 8px;
  width: 12px;
}

.server-name {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.server-select-all-btn {
  padding: 2px 8px;
  margin-right: 8px;
  font-size: 11px;
  line-height: 1;
}

.server-status {
  margin-right: 8px;
  color: var(--sm-color-text-tertiary);
}

.server-status.connected {
  color: var(--theme-success);
}

.tools-count-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-subtle);
  color: var(--sm-color-text-tertiary);
  border-radius: 10px;
}

.server-tools {
  padding: 2px 0;
}

.tool-item {
  padding: 8px 16px 8px 36px;
  cursor: pointer;
  transition: background-color var(--sm-transition-fast);
}

.tool-item:hover {
  background: var(--sm-color-surface-1);
}

.tool-item.selected {
  background: rgba(142, 149, 217, 0.08);
}

.tool-item:focus-visible {
  background: var(--sm-color-surface-1);
}

.tool-item.highlight {
  animation: highlight-pulse 0.48s ease-out;
}

@keyframes highlight-pulse {
  0% {
    background-color: rgba(142, 149, 217, 0.14);
  }
  100% {
    background-color: rgba(142, 149, 217, 0.08);
  }
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-checkbox {
  font-size: 14px;
  color: var(--sm-color-text-tertiary);
}

.tool-item.selected .tool-checkbox {
  color: var(--sm-color-accent-hover);
}

.tool-name {
  font-size: 13px;
  font-family: var(--sm-font-mono);
  color: var(--sm-color-text-primary);
}

.tool-description-wrapper {
  margin-top: 6px;
}

.tool-description {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tool-description.expanded {
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
  padding: 2px 0;
  margin-top: 4px;
  transition: opacity var(--sm-transition-fast);
}

.description-toggle-btn:hover {
  opacity: 0.8;
  text-decoration: underline;
}
</style>
