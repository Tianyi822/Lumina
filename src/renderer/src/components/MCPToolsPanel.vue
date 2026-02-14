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
const { statuses, searchQuery, expandedServers, filteredToolsByServer } = storeToRefs(mcpStore)

// 兼容旧命名
const connectionStatuses = statuses
const totalToolsCount = computed(() => mcpStore.totalToolsCount)
const connectedServersCount = computed(() => mcpStore.connectedServersCount)

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
 * 移除单个工具
 */
function removeTool(tool: MCPTool): void {
  const index = localSelectedTools.value.findIndex(
    (t) => t.name === tool.name && t.serverName === tool.serverName
  )
  if (index >= 0) {
    localSelectedTools.value.splice(index, 1)
  }
}

/**
 * 清除所有选择
 */
function clearSelection(): void {
  localSelectedTools.value = []
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
  clearAllStates: clearDescriptionStates,
  scrollToTool
} = useMCPUI(mcpStore.loadAllTools, expandedServers)

/**
 * 加载工具列表（包装版本，添加额外逻辑）
 */
async function loadTools(): Promise<void> {
  await mcpStore.loadAllTools()

  // 清空之前的展开状态
  clearDescriptionStates()

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
 * 移除单个工具（包装版本，触发 emit）
 */
function handleRemoveTool(tool: MCPTool): void {
  removeTool(tool)
  emit('tools-selected', getSelectedTools())
}

/**
 * 清除所有选择（包装版本，触发 emit）
 */
function handleClearSelection(): void {
  clearSelection()
  emit('tools-selected', [])
}

/**
 * 切换服务器展开状态（包装版本，刷新溢出检查）
 */
function handleToggleServer(serverName: string): void {
  mcpStore.toggleServerExpanded(serverName)
  // 展开服务器后，检查工具描述溢出状态
  if (mcpStore.isServerExpanded(serverName)) {
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
      class="btn mcp-trigger-btn"
      :class="{ active: showPanel, 'has-selection': selectedToolsCount > 0 }"
      @click="togglePanel"
    >
      <span class="mcp-icon">⚡</span>
      <span v-if="selectedToolsCount > 0" class="selected-tool-name">
        已选 {{ selectedToolsCount }} 个工具
      </span>
      <span v-else>MCP 工具</span>
      <span v-if="totalToolsCount > 0" class="tools-count">{{ totalToolsCount }}</span>
      <span class="dropdown-arrow">{{ showPanel ? '▲' : '▼' }}</span>
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
        />
      </div>

      <!-- 已选工具列表 -->
      <div v-if="selectedToolsCount > 0" class="selected-tools-bar">
        <div class="selected-tools-header">
          <span class="selected-label">已选择 {{ selectedToolsCount }} 个工具:</span>
          <button class="btn btn-clear-all" @click="handleClearSelection">全部清除</button>
        </div>
        <div class="selected-tools-list">
          <div
            v-for="tool in localSelectedTools"
            :key="`selected-${tool.serverName}-${tool.name}`"
            class="selected-tool-chip"
            @click="scrollToTool(tool)"
          >
            <span class="chip-text">{{ tool.name }}</span>
            <button class="chip-remove" @click.stop="handleRemoveTool(tool)">×</button>
          </div>
        </div>
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
          <div class="server-header" @click="handleToggleServer(serverName as string)">
            <span class="expand-icon">{{
              expandedServers.has(serverName as string) ? '▼' : '▶'
            }}</span>
            <span class="server-name">{{ serverName }}</span>
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
              @click="handleToggleTool(tool)"
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
}

.mcp-trigger-btn.active {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
}

.mcp-trigger-btn.has-selection {
  color: var(--theme-accent);
}

.mcp-icon {
  font-size: 14px;
}

.selected-tool-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: 12px;
}

.tools-count {
  font-size: 11px;
  padding: 1px 6px;
  background-color: var(--theme-accent);
  color: var(--theme-bg);
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--theme-text-secondary);
}

.mcp-tools-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  width: 400px;
  max-height: 480px;
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  box-shadow: var(--theme-shadow);
  display: flex;
  flex-direction: column;
  z-index: 200;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--theme-border);
}

.panel-title {
  font-weight: 600;
  color: var(--theme-text);
}

.connection-info {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.search-box {
  padding: 8px 12px;
  border-bottom: 1px solid var(--theme-border);
}

.search-input {
  width: 100%;
  font-size: 13px;
}

.selected-tools-bar {
  max-height: 140px;
  overflow-y: auto;
  padding: 8px 12px;
  background-color: rgba(63, 185, 80, 0.1);
  border-bottom: 1px solid var(--theme-border);

  /* 自定义滚动条样式 */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--theme-border);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--theme-text-secondary);
  }

  /* 伸缩以适应内容，但不超过最大高度 */
  flex-shrink: 0;
}

.selected-tools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.selected-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.btn-clear-all {
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1;
}

.selected-tools-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.selected-tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px 3px 8px;
  background-color: var(--theme-accent);
  color: var(--theme-bg);
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.2;
  max-width: 100%;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.1s ease;
}

.selected-tool-chip:hover {
  background-color: var(--theme-accent-secondary);
  transform: translateY(-1px);
}

.selected-tool-chip:active {
  transform: translateY(0);
}

.chip-text {
  font-family: monospace;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  background: none;
  border: none;
  color: var(--theme-bg);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  flex-shrink: 0;
  border-radius: 50%;
  transition: background-color 0.15s ease;
}

.chip-remove:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.2);
}

.tools-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  min-height: 120px;

  /* 自定义滚动条样式 */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--theme-border);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--theme-text-secondary);
  }
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--theme-text-secondary);
  font-size: 13px;
}

.server-group {
  border-bottom: 1px solid var(--theme-border);
}

.server-group:last-child {
  border-bottom: none;
}

.server-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.server-header:hover {
  background-color: var(--theme-bg-hover);
}

.expand-icon {
  font-size: 10px;
  color: var(--theme-text-secondary);
  margin-right: 8px;
  width: 12px;
}

.server-name {
  flex: 1;
  font-weight: 500;
  color: var(--theme-text);
}

.server-status {
  margin-right: 8px;
  color: var(--theme-text-secondary);
}

.server-status.connected {
  color: var(--theme-accent);
}

.tools-count-badge {
  font-size: 11px;
  padding: 2px 6px;
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  border-radius: 10px;
}

.server-tools {
  padding: 4px 0;
}

.tool-item {
  padding: 8px 16px 8px 36px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.tool-item:hover {
  background-color: var(--theme-bg-hover);
}

.tool-item.selected {
  background-color: rgba(63, 185, 80, 0.15);
}

/* 高亮动画 */
.tool-item.highlight {
  animation: highlight-pulse 1.5s ease-in-out;
}

@keyframes highlight-pulse {
  0% {
    background-color: rgba(88, 166, 255, 0.3);
    box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.5);
  }
  50% {
    background-color: rgba(88, 166, 255, 0.5);
    box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.3);
  }
  100% {
    background-color: rgba(63, 185, 80, 0.15);
    box-shadow: none;
  }
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-checkbox {
  font-size: 14px;
  color: var(--theme-text-secondary);
}

.tool-item.selected .tool-checkbox {
  color: var(--theme-accent);
}

.tool-name {
  font-size: 13px;
  font-family: monospace;
  color: var(--theme-accent);
}

.tool-description-wrapper {
  margin-top: 6px;
}

.tool-description {
  font-size: 12px;
  color: var(--theme-text-secondary);
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
  color: var(--theme-accent);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 0;
  margin-top: 4px;
  transition: opacity 0.15s ease;
}

.description-toggle-btn:hover {
  opacity: 0.8;
  text-decoration: underline;
}
</style>
