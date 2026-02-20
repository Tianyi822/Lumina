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
  font-size: 12px;
}

.mcp-trigger-btn.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
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
  font-family: var(--theme-font-mono, monospace);
  font-size: 12px;
}

.tools-count {
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

.mcp-tools-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  width: 400px;
  max-height: 480px;
  background:
    linear-gradient(135deg, var(--glass-white-03, rgba(255,255,255,0.03)) 0%, var(--glass-white-017, rgba(255,255,255,0.017)) 100%),
    linear-gradient(225deg, var(--glass-white-023, rgba(255,255,255,0.023)) 0%, var(--glass-white-007, rgba(255,255,255,0.007)) 100%),
    var(--theme-bg);
  backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  -webkit-backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  border: 1px solid var(--glass-white-12, rgba(255,255,255,0.12));
  border-radius: var(--theme-radius);
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.25),
    0 4px 16px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 var(--glass-white-15, rgba(255,255,255,0.15));
  display: flex;
  flex-direction: column;
  z-index: 200;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
}

.panel-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--theme-text);
}

.connection-info {
  font-size: 12px;
  color: var(--theme-text-tertiary);
}

.search-box {
  padding: 8px 12px;
  border-bottom: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
}

.search-input {
  width: 100%;
  font-size: 13px;
}

.selected-tools-bar {
  max-height: 140px;
  overflow-y: auto;
  padding: 8px 12px;
  background: rgba(99, 102, 241, 0.06);
  border-bottom: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
  flex-shrink: 0;
}

.selected-tools-bar::-webkit-scrollbar {
  width: 4px;
}

.selected-tools-bar::-webkit-scrollbar-track {
  background: transparent;
}

.selected-tools-bar::-webkit-scrollbar-thumb {
  background: var(--glass-white-15, rgba(255,255,255,0.15));
  border-radius: 2px;
}

.selected-tools-header {
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
  background: linear-gradient(135deg, var(--theme-accent) 0%, var(--theme-accent-tertiary) 100%);
  color: white;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.2;
  max-width: 100%;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.selected-tool-chip:hover {
  background: linear-gradient(135deg, var(--theme-accent-secondary) 0%, var(--theme-accent) 100%);
  transform: translateY(-1px);
}

.selected-tool-chip:active {
  transform: translateY(0);
}

.chip-text {
  font-family: var(--theme-font-mono, monospace);
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
  background: var(--glass-white-15, rgba(255,255,255,0.15));
  border-radius: 2px;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--theme-text-tertiary);
  font-size: 13px;
}

.server-group {
  border-bottom: 1px solid var(--glass-white-06, rgba(255,255,255,0.06));
}

.server-group:last-child {
  border-bottom: none;
}

.server-header {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.server-header:hover {
  background: var(--glass-white-05, rgba(255,255,255,0.05));
}

.expand-icon {
  font-size: 10px;
  color: var(--theme-text-tertiary);
  margin-right: 8px;
  width: 12px;
}

.server-name {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
  color: var(--theme-text);
}

.server-status {
  margin-right: 8px;
  color: var(--theme-text-tertiary);
}

.server-status.connected {
  color: var(--theme-success);
}

.tools-count-badge {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--glass-white-05, rgba(255,255,255,0.05));
  color: var(--theme-text-tertiary);
  border-radius: 10px;
}

.server-tools {
  padding: 2px 0;
}

.tool-item {
  padding: 8px 16px 8px 36px;
  cursor: pointer;
  transition: all 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.tool-item:hover {
  background: var(--glass-white-05, rgba(255,255,255,0.05));
}

.tool-item.selected {
  background: rgba(99, 102, 241, 0.08);
}

/* 高亮动画 */
.tool-item.highlight {
  animation: highlight-pulse 1.5s ease-in-out;
}

@keyframes highlight-pulse {
  0% {
    background-color: rgba(99, 102, 241, 0.2);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.4);
  }
  50% {
    background-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
  }
  100% {
    background-color: rgba(99, 102, 241, 0.08);
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
  color: var(--theme-text-tertiary);
}

.tool-item.selected .tool-checkbox {
  color: var(--theme-accent);
}

.tool-name {
  font-size: 13px;
  font-family: var(--theme-font-mono, monospace);
  color: var(--theme-accent);
}

.tool-description-wrapper {
  margin-top: 6px;
}

.tool-description {
  font-size: 12px;
  color: var(--theme-text-tertiary);
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
  transition: opacity 0.15s;
}

.description-toggle-btn:hover {
  opacity: 0.8;
  text-decoration: underline;
}
</style>
