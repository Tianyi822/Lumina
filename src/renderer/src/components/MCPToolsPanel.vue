<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch, type Ref } from 'vue'

interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverName: string
}

interface MCPConnectionStatus {
  serverName: string
  connected: boolean
  error?: string
  tools: MCPTool[]
}

const emit = defineEmits<{
  (e: 'tool-selected', tool: MCPTool | null): void
}>()

// 是否显示面板
const showPanel = ref(false)

// 工具按服务器分组
const toolsByServer = ref<Record<string, MCPTool[]>>({})

// 连接状态
const connectionStatuses = ref<MCPConnectionStatus[]>([])

// 展开的服务器
const expandedServers = ref<Set<string>>(new Set())

// 搜索关键词
const searchQuery = ref('')

// 选中的工具
const selectedTool = ref<MCPTool | null>(null)

// 注入 MCP 更新标志
const mcpUpdateKey = inject<Ref<number>>('mcpUpdateKey', ref(0))

// 过滤后的工具
const filteredToolsByServer = computed(() => {
  if (!searchQuery.value.trim()) {
    return toolsByServer.value
  }

  const query = searchQuery.value.toLowerCase()
  const result: Record<string, MCPTool[]> = {}

  for (const [serverName, tools] of Object.entries(toolsByServer.value)) {
    const filtered = tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query)
    )
    if (filtered.length > 0) {
      result[serverName] = filtered
    }
  }

  return result
})

// 总工具数量
const totalToolsCount = computed(() => {
  return Object.values(toolsByServer.value).reduce((sum, tools) => sum + tools.length, 0)
})

// 已连接服务器数量
const connectedServersCount = computed(() => {
  return connectionStatuses.value.filter((s) => s.connected).length
})

// 加载工具列表
async function loadTools(): Promise<void> {
  try {
    toolsByServer.value = await window.api.mcp.listToolsByServer()
    connectionStatuses.value = await window.api.mcp.getStatus()

    // 默认展开所有已连接的服务器
    for (const status of connectionStatuses.value) {
      if (status.connected) {
        expandedServers.value.add(status.serverName)
      }
    }
  } catch (error) {
    console.error('加载 MCP 工具失败:', error)
  }
}

// 切换服务器展开状态
function toggleServer(serverName: string): void {
  if (expandedServers.value.has(serverName)) {
    expandedServers.value.delete(serverName)
  } else {
    expandedServers.value.add(serverName)
  }
}

// 选择工具
function selectTool(tool: MCPTool): void {
  if (
    selectedTool.value?.name === tool.name &&
    selectedTool.value?.serverName === tool.serverName
  ) {
    // 取消选择
    selectedTool.value = null
  } else {
    selectedTool.value = tool
  }
  emit('tool-selected', selectedTool.value)
}

// 清除选择
function clearSelection(): void {
  selectedTool.value = null
  emit('tool-selected', null)
}

// 切换面板显示
function togglePanel(): void {
  showPanel.value = !showPanel.value
  if (showPanel.value) {
    loadTools()
  }
}

// 获取服务器连接状态
function isServerConnected(serverName: string): boolean {
  const status = connectionStatuses.value.find((s) => s.serverName === serverName)
  return status?.connected ?? false
}

// MCP 状态变更监听器
let statusUnsubscribe: (() => void) | null = null

// 监听 MCP 更新
watch(mcpUpdateKey, () => {
  loadTools()
})

onMounted(() => {
  loadTools()
  // 监听状态变更
  statusUnsubscribe = window.api.mcp.onStatusChange(() => {
    loadTools()
  })
})

onUnmounted(() => {
  if (statusUnsubscribe) {
    statusUnsubscribe()
  }
})
</script>

<template>
  <div class="mcp-tools-container">
    <!-- 触发按钮 -->
    <button
      class="btn mcp-trigger-btn"
      :class="{ active: showPanel, 'has-selection': selectedTool }"
      @click="togglePanel"
    >
      <span class="mcp-icon">⚡</span>
      <span v-if="selectedTool" class="selected-tool-name">{{ selectedTool.name }}</span>
      <span v-else>MCP 工具</span>
      <span v-if="totalToolsCount > 0" class="tools-count">{{ totalToolsCount }}</span>
      <span class="dropdown-arrow">{{ showPanel ? '▲' : '▼' }}</span>
    </button>

    <!-- 工具面板 -->
    <div v-if="showPanel" class="mcp-tools-panel">
      <!-- 头部 -->
      <div class="panel-header">
        <span class="panel-title">MCP 工具</span>
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

      <!-- 已选工具 -->
      <div v-if="selectedTool" class="selected-tool-bar">
        <span class="selected-label">已选择:</span>
        <span class="selected-tool">{{ selectedTool.serverName }}/{{ selectedTool.name }}</span>
        <button class="btn btn-clear" @click="clearSelection">×</button>
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
          <div class="server-header" @click="toggleServer(serverName as string)">
            <span class="expand-icon">{{
              expandedServers.has(serverName as string) ? '▼' : '▶'
            }}</span>
            <span class="server-name">{{ serverName }}</span>
            <span
              class="server-status"
              :class="{ connected: isServerConnected(serverName as string) }"
            >
              {{ isServerConnected(serverName as string) ? '●' : '○' }}
            </span>
            <span class="tools-count-badge">{{ tools.length }}</span>
          </div>

          <div v-if="expandedServers.has(serverName as string)" class="server-tools">
            <div
              v-for="tool in tools"
              :key="`${serverName}-${tool.name}`"
              class="tool-item"
              :class="{
                selected:
                  selectedTool?.name === tool.name && selectedTool?.serverName === tool.serverName
              }"
              @click="selectTool(tool)"
            >
              <div class="tool-header">
                <span class="tool-name">{{ tool.name }}</span>
              </div>
              <div v-if="tool.description" class="tool-description">
                {{ tool.description }}
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
  width: 360px;
  max-height: 400px;
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

.selected-tool-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: rgba(63, 185, 80, 0.1);
  border-bottom: 1px solid var(--theme-border);
}

.selected-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.selected-tool {
  flex: 1;
  font-size: 12px;
  font-family: monospace;
  color: var(--theme-accent);
}

.btn-clear {
  padding: 2px 8px;
  font-size: 14px;
  line-height: 1;
}

.tools-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
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

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-name {
  font-size: 13px;
  font-family: monospace;
  color: var(--theme-accent);
}

.tool-description {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 4px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
