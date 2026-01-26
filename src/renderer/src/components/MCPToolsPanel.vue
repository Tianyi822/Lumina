<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch, nextTick, type Ref } from 'vue'
import type { MCPTool, MCPConnectionStatus } from '@renderer/types'

const emit = defineEmits<{
  (e: 'tools-selected', tools: MCPTool[]): void
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

// 选中的工具列表（支持多选）
const selectedTools = ref<MCPTool[]>([])

// 工具描述展开状态
const expandedDescriptions = ref<Set<string>>(new Set())

// 需要显示展开按钮的工具描述
const showExpandButton = ref<Set<string>>(new Set())

// 工具描述元素引用
const descriptionRefs = ref<Map<string, HTMLElement>>(new Map())

// MCP 工具容器引用
const mcpContainerRef = ref<HTMLElement | null>(null)

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

// 已选择的工具数量
const selectedToolsCount = computed(() => {
  return selectedTools.value.length
})

// 加载工具列表
async function loadTools(): Promise<void> {
  try {
    toolsByServer.value = await window.api.mcp.listToolsByServer()
    connectionStatuses.value = await window.api.mcp.getStatus()

    // 清空之前的展开状态
    showExpandButton.value.clear()
    descriptionRefs.value.clear()
    expandedDescriptions.value.clear()

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
    // 展开服务器后，检查工具描述溢出状态
    nextTick(() => {
      refreshAllOverflowChecks()
    })
  }
}

// 检查工具是否被选中
function isToolSelected(tool: MCPTool): boolean {
  return selectedTools.value.some((t) => t.name === tool.name && t.serverName === tool.serverName)
}

// 选择/取消选择工具（多选模式）
function toggleTool(tool: MCPTool): void {
  const index = selectedTools.value.findIndex(
    (t) => t.name === tool.name && t.serverName === tool.serverName
  )

  if (index >= 0) {
    // 取消选择
    selectedTools.value.splice(index, 1)
  } else {
    // 添加选择
    selectedTools.value.push(tool)
  }

  // 调试日志：确认工具选择事件
  console.log('[MCPToolsPanel] 工具选择变更:', {
    action: index >= 0 ? 'removed' : 'added',
    tool: `${tool.serverName}/${tool.name}`,
    selectedCount: selectedTools.value.length,
    selectedTools: selectedTools.value.map((t) => `${t.serverName}/${t.name}`)
  })

  emit('tools-selected', [...selectedTools.value])
}

// 移除单个工具
function removeTool(tool: MCPTool): void {
  const index = selectedTools.value.findIndex(
    (t) => t.name === tool.name && t.serverName === tool.serverName
  )
  if (index >= 0) {
    selectedTools.value.splice(index, 1)
    emit('tools-selected', [...selectedTools.value])
  }
}

// 清除所有选择
function clearSelection(): void {
  selectedTools.value = []
  emit('tools-selected', [])
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

/**
 * 处理点击外部区域，关闭面板
 */
function handleClickOutside(event: MouseEvent): void {
  if (showPanel.value && mcpContainerRef.value) {
    const target = event.target as Node
    if (!mcpContainerRef.value.contains(target)) {
      showPanel.value = false
    }
  }
}

/**
 * 滚动到指定工具的位置
 */
function scrollToTool(tool: MCPTool): void {
  const toolElementId = `tool-${tool.serverName}-${tool.name}`
  const toolElement = document.getElementById(toolElementId)

  if (toolElement) {
    // 确保服务器已展开
    if (!expandedServers.value.has(tool.serverName)) {
      expandedServers.value.add(tool.serverName)
      // 等待 DOM 更新后再滚动
      setTimeout(() => {
        const element = document.getElementById(toolElementId)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // 添加高亮动画
          element.classList.add('highlight')
          setTimeout(() => {
            element.classList.remove('highlight')
          }, 1500)
        }
      }, 100)
    } else {
      // 直接滚动
      toolElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // 添加高亮动画
      toolElement.classList.add('highlight')
      setTimeout(() => {
        toolElement.classList.remove('highlight')
      }, 1500)
    }
  }
}

/**
 * 切换工具描述展开状态
 */
function toggleDescription(tool: MCPTool): void {
  const key = `${tool.serverName}-${tool.name}`
  if (expandedDescriptions.value.has(key)) {
    expandedDescriptions.value.delete(key)
  } else {
    expandedDescriptions.value.add(key)
  }
}

/**
 * 检查工具描述是否展开
 */
function isDescriptionExpanded(tool: MCPTool): boolean {
  const key = `${tool.serverName}-${tool.name}`
  return expandedDescriptions.value.has(key)
}

/**
 * 检查是否需要显示展开按钮
 */
function shouldShowExpandButton(tool: MCPTool): boolean {
  const key = `${tool.serverName}-${tool.name}`
  return showExpandButton.value.has(key)
}

/**
 * 检查描述元素是否溢出
 */
function checkDescriptionOverflow(tool: MCPTool, element: HTMLElement | null): void {
  if (!element) {
    return
  }

  const key = `${tool.serverName}-${tool.name}`

  // 临时移除expanded类来检测真实溢出状态
  const wasExpanded = element.classList.contains('expanded')
  if (wasExpanded) {
    element.classList.remove('expanded')
  }

  // 检测内容是否溢出（scrollHeight > clientHeight）
  const hasOverflow = element.scrollHeight > element.clientHeight

  // 恢复expanded状态
  if (wasExpanded) {
    element.classList.add('expanded')
  }

  // 只有在内容溢出时才显示按钮，且一旦显示就不再隐藏
  if (hasOverflow) {
    showExpandButton.value.add(key)
  }
}

/**
 * 设置描述元素引用并检查溢出
 */
function setDescriptionRef(tool: MCPTool, element: unknown): void {
  if (!element || typeof element === 'function') return

  // 确保是 DOM 元素
  const domElement = element as HTMLElement
  const key = `${tool.serverName}-${tool.name}`
  descriptionRefs.value.set(key, domElement)

  // 在 nextTick 中检查，确保样式已应用
  nextTick(() => {
    checkDescriptionOverflow(tool, domElement)
  })
}

/**
 * 切换服务器展开状态时，重新检查所有工具描述的溢出状态
 */
function refreshAllOverflowChecks(): void {
  nextTick(() => {
    descriptionRefs.value.forEach((element, key) => {
      const [serverName, toolName] = key.split('-')
      const tool: MCPTool = {
        name: toolName,
        serverName,
        description: '',
        inputSchema: {}
      }
      checkDescriptionOverflow(tool, element)
    })
  })
}

// 监听搜索查询变化，重新检查溢出状态
watch(searchQuery, () => {
  nextTick(() => {
    refreshAllOverflowChecks()
  })
})

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
  // 添加全局点击事件监听器
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  if (statusUnsubscribe) {
    statusUnsubscribe()
  }
  // 移除全局点击事件监听器
  document.removeEventListener('click', handleClickOutside)
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
          <button class="btn btn-clear-all" @click="clearSelection">全部清除</button>
        </div>
        <div class="selected-tools-list">
          <div
            v-for="tool in selectedTools"
            :key="`selected-${tool.serverName}-${tool.name}`"
            class="selected-tool-chip"
            @click="scrollToTool(tool)"
          >
            <span class="chip-text">{{ tool.name }}</span>
            <button class="chip-remove" @click.stop="removeTool(tool)">×</button>
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
              :id="`tool-${serverName}-${tool.name}`"
              :key="`${serverName}-${tool.name}`"
              class="tool-item"
              :class="{ selected: isToolSelected(tool) }"
              @click="toggleTool(tool)"
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
