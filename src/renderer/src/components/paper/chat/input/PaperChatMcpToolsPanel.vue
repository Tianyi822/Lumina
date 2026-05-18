<script setup lang="ts">
import { ref, inject, watch, nextTick, onMounted, onUnmounted, computed, type Ref } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import type { MCPTool } from '@renderer/types'
import { useMCPStore } from '@renderer/stores'
import { useMCPUI } from '@renderer/composables/mcp/useMCPUI'
import styles from './PaperChatMcpToolsPanel.module.css'

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
const mcpStore = useZustandStore(useMCPStore)

// 搜索查询（双向绑定用 computed）
const searchQuery = computed({
  get: () => mcpStore.searchQuery,
  set: (val) => mcpStore.setSearchQuery(val)
})

// 兼容旧命名（statuses 保留在 mcpStore 上直接访问）
const totalToolsCount = computed(() => mcpStore.totalToolsCount())
const connectedServersCount = computed(() => mcpStore.connectedServersCount())
const expandedServers = ref<Set<string>>(new Set())

// getter 函数需通过 computed 包装以保持模板响应性
const filteredToolsByServer = computed(() => mcpStore.filteredToolsByServer())

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
  for (const status of mcpStore.statuses) {
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
watch(
  () => mcpStore.searchQuery,
  () => {
    nextTick(() => {
      refreshAllOverflowChecks()
    })
  }
)

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
      :class="[
        'btn',
        styles['paper-chat-mcp-tools__trigger'],
        { active: showPanel, 'has-selection': selectedToolsCount > 0 }
      ]"
      :aria-expanded="showPanel"
      @click="togglePanel"
    >
      <span v-if="selectedToolsCount > 0" :class="styles['paper-chat-mcp-tools__selected-name']">
        已选 {{ selectedToolsCount }} 个工具
      </span>
      <span v-else>{{ props.compact ? 'MCP' : 'MCP 工具' }}</span>
      <span v-if="totalToolsCount > 0" :class="styles['paper-chat-mcp-tools__count']">{{
        totalToolsCount
      }}</span>
      <span class="paper-chat-mcp-tools__dropdown-arrow" :class="{ open: showPanel }">▼</span>
    </button>

    <!-- 工具面板 -->
    <div v-if="showPanel" :class="styles['paper-chat-mcp-tools-panel']">
      <!-- 头部 -->
      <div :class="styles['paper-chat-mcp-tools-panel__header']">
        <span :class="styles['paper-chat-mcp-tools-panel__title']">MCP 工具（多选）</span>
        <span :class="styles['paper-chat-mcp-tools-panel__connection-info']">
          {{ connectedServersCount }} 个服务器已连接
        </span>
      </div>

      <!-- 搜索框 -->
      <div :class="styles['paper-chat-mcp-tools-panel__search']">
        <input
          v-model="searchQuery"
          type="text"
          :class="['input', styles['paper-chat-mcp-tools-panel__search-input']]"
          placeholder="搜索工具..."
          aria-label="搜索 MCP 工具"
        />
      </div>

      <!-- 工具列表 -->
      <div :class="styles['paper-chat-mcp-tools-panel__tools']">
        <div
          v-if="Object.keys(filteredToolsByServer).length === 0"
          :class="styles['paper-chat-mcp-tools-panel__empty']"
        >
          <p v-if="searchQuery">未找到匹配的工具</p>
          <p v-else>暂无可用工具，请在设置中配置 MCP 服务器</p>
        </div>

        <div
          v-for="(tools, serverName) in filteredToolsByServer"
          :key="serverName"
          :class="styles['paper-chat-mcp-tools-panel__server']"
        >
          <div
            :class="styles['paper-chat-mcp-tools-panel__server-header']"
            role="button"
            tabindex="0"
            :aria-expanded="expandedServers.has(serverName as string)"
            @click="handleToggleServer(serverName as string)"
            @keydown.enter.prevent="handleToggleServer(serverName as string)"
            @keydown.space.prevent="handleToggleServer(serverName as string)"
          >
            <span :class="styles['paper-chat-mcp-tools-panel__expand-icon']">{{
              expandedServers.has(serverName as string) ? '▼' : '▶'
            }}</span>
            <span :class="styles['paper-chat-mcp-tools-panel__server-name']">{{ serverName }}</span>
            <button
              type="button"
              :class="['btn', styles['paper-chat-mcp-tools-panel__server-select-all']]"
              @click.stop="handleToggleServerGroupTools(tools)"
            >
              {{ isServerGroupFullySelected(tools) ? '取消全选' : '全选' }}
            </button>
            <span
              :class="[
                styles['paper-chat-mcp-tools-panel__server-status'],
                { connected: mcpStore.isServerConnected(serverName as string) }
              ]"
            >
              {{ mcpStore.isServerConnected(serverName as string) ? '●' : '○' }}
            </span>
            <span :class="styles['paper-chat-mcp-tools__count-badge']">{{ tools.length }}</span>
          </div>

          <div
            v-if="expandedServers.has(serverName as string)"
            :class="styles['paper-chat-mcp-tools-panel__server-tools']"
          >
            <div
              v-for="tool in tools"
              :id="`tool-${serverName}-${tool.name}`"
              :key="`${serverName}-${tool.name}`"
              :class="[
                styles['paper-chat-mcp-tools-panel__tool'],
                { selected: isToolSelected(tool) }
              ]"
              role="button"
              tabindex="0"
              :aria-selected="isToolSelected(tool)"
              @click="handleToggleTool(tool)"
              @keydown.enter.prevent="handleToggleTool(tool)"
              @keydown.space.prevent="handleToggleTool(tool)"
            >
              <div :class="styles['paper-chat-mcp-tools-panel__tool-header']">
                <span :class="styles['paper-chat-mcp-tools-panel__tool-checkbox']">{{
                  isToolSelected(tool) ? '☑' : '☐'
                }}</span>
                <span :class="styles['paper-chat-mcp-tools-panel__tool-name']">{{
                  tool.name
                }}</span>
              </div>
              <div
                v-if="tool.description"
                :class="styles['paper-chat-mcp-tools-panel__tool-description-wrapper']"
              >
                <div
                  :ref="(el) => setDescriptionRef(tool, el)"
                  :class="[
                    styles['paper-chat-mcp-tools-panel__tool-description'],
                    { expanded: isDescriptionExpanded(tool) }
                  ]"
                >
                  {{ tool.description }}
                </div>
                <button
                  v-if="shouldShowExpandButton(tool)"
                  type="button"
                  :class="styles['paper-chat-mcp-tools-panel__description-toggle']"
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
