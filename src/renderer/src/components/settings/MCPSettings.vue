<script setup lang="ts">
import { ref, onMounted } from 'vue'
import MCPServerItem from '../mcp/MCPServerItem.vue'
import MCPNewServerForm from '../mcp/MCPNewServerForm.vue'
import { useMCPConfig } from '@renderer/composables/mcp/useMCPConfig'
import { useMCPConnection } from '@renderer/composables/mcp/useMCPConnection'
import type { MCPServerConfig } from '@renderer/types'

interface Props {
  errorMessage: string
  successMessage: string
}

interface Emits {
  (e: 'update:errorMessage', value: string): void
  (e: 'update:successMessage', value: string): void
  (e: 'mcp-updated'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

// 使用 composables
const { mcpConfigs, loadConfigs, saveConfig, deleteConfig, getStatus } = useMCPConfig()
const { connecting, testing, connect, disconnect, testConnection, onStatusChange } =
  useMCPConnection()

// UI 状态
const expandedMCPServers = ref<Set<string>>(new Set())
const showNewMCPForm = ref(false)
const testResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)

// 显示消息
function showError(message: string): void {
  emit('update:errorMessage', message)
}

function showSuccess(message: string): void {
  emit('update:successMessage', message)
  setTimeout(
    () => {
      emit('update:successMessage', '')
    },
    message.includes('工具') ? 3000 : 2000
  )
}

// 切换 MCP 服务器展开状态
function toggleMCPExpand(name: string): void {
  if (expandedMCPServers.value.has(name)) {
    expandedMCPServers.value.delete(name)
  } else {
    expandedMCPServers.value.add(name)
  }
}

// 连接 MCP 服务器
async function handleConnect(name: string): Promise<void> {
  const success = await connect(
    name,
    (msg) => showSuccess(msg),
    (msg) => showError(msg)
  )
  if (success) {
    await loadConfigs()
    emit('mcp-updated')
  }
}

// 断开 MCP 服务器
async function handleDisconnect(name: string): Promise<void> {
  const success = await disconnect(name, (msg) => showError(msg))
  if (success) {
    await loadConfigs()
    emit('mcp-updated')
  }
}

// 测试 MCP 连接
async function handleTest(config: MCPServerConfig): Promise<void> {
  const success = await testConnection(
    config,
    (msg) => showSuccess(msg),
    (msg) => showError(msg)
  )
  testResult.value = success
    ? { type: 'success', message: `${config.name} 连接测试成功` }
    : { type: 'error', message: `${config.name} 连接测试失败` }
}

// 删除 MCP 配置
async function handleDelete(name: string): Promise<void> {
  const success = await deleteConfig(name)
  if (success) {
    expandedMCPServers.value.delete(name)
    emit('mcp-updated')
  }
}

// 保存 MCP 配置
async function handleSave(config: MCPServerConfig): Promise<void> {
  const success = await saveConfig(config)
  if (success) {
    emit('mcp-updated')
  }
}

// 切换 MCP 启用状态
async function handleToggleEnabled(config: MCPServerConfig): Promise<void> {
  const updatedConfig = { ...config, enabled: !config.enabled }
  await handleSave(updatedConfig)
  if (!updatedConfig.enabled) {
    await handleDisconnect(config.name)
  }
}

// 添加新 MCP 配置
async function handleAddNew(config: MCPServerConfig): Promise<void> {
  const success = await saveConfig(config)
  if (success) {
    showNewMCPForm.value = false
    emit('mcp-updated')
  }
}

// 测试新建的 MCP 配置
async function handleTestNew(config: MCPServerConfig): Promise<void> {
  await handleTest(config)
}

// 导入 MCP 配置
async function importMCPConfigs(): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      const result = await window.api.mcp.importConfigs(content)
      if (result.success) {
        showSuccess(`成功导入 ${result.imported} 个配置`)
        if (result.errors.length > 0) {
          console.warn('导入过程中的错误:', result.errors)
        }
        await loadConfigs()
        emit('mcp-updated')
      } else {
        showError(`导入失败: ${result.errors.join(', ')}`)
      }
    } catch (error) {
      showError(`导入失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  input.click()
}

// 监听 MCP 状态变更
onStatusChange(() => {
  loadConfigs()
})

// 组件挂载时加载配置
onMounted(() => {
  loadConfigs()
})
</script>

<template>
  <div class="tab-content">
    <!-- 操作按钮 -->
    <div class="mcp-actions-bar">
      <button class="btn btn-small" @click="importMCPConfigs">导入配置</button>
    </div>

    <!-- MCP 服务器列表 -->
    <div class="model-list">
      <MCPServerItem
        v-for="config in mcpConfigs"
        :key="config.name"
        :config="config"
        :status="getStatus(config.name)"
        :expanded="expandedMCPServers.has(config.name)"
        :connecting="connecting === config.name"
        :testing="testing === config.name"
        @toggle-expand="toggleMCPExpand"
        @connect="handleConnect"
        @disconnect="handleDisconnect"
        @delete="handleDelete"
        @test="handleTest"
        @save="handleSave"
        @toggle-enabled="handleToggleEnabled"
      />

      <!-- 空状态 -->
      <div v-if="mcpConfigs.length === 0 && !showNewMCPForm" class="empty-state">
        <p>暂无 MCP 服务配置</p>
      </div>
    </div>

    <!-- 添加新 MCP 服务器表单 -->
    <MCPNewServerForm
      v-if="showNewMCPForm"
      :existing-names="mcpConfigs.map((c) => c.name)"
      @submit="handleAddNew"
      @cancel="showNewMCPForm = false"
      @test="handleTestNew"
    />

    <!-- 添加 MCP 按钮 -->
    <button v-if="!showNewMCPForm" class="btn add-model-btn" @click="showNewMCPForm = true">
      + 添加 MCP 服务器
    </button>
  </div>
</template>

<style scoped>
.mcp-actions-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--theme-text-secondary);
}

.add-model-btn {
  width: 100%;
  padding: 12px;
  border-style: dashed;
  color: var(--theme-text-secondary);
}

.add-model-btn:hover {
  color: var(--theme-accent);
  border-color: var(--theme-accent);
}
</style>
