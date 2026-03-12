<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import MCPServerItem from '../mcp/MCPServerItem.vue'
import MCPNewServerForm from '../mcp/MCPNewServerForm.vue'
import { useMCPStore } from '@renderer/stores'
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

// 使用 MCP Store
const mcpStore = useMCPStore()
const { configs: mcpConfigs, connecting, testing, expandedServers } = storeToRefs(mcpStore)
const { loadConfigs, saveConfig, deleteConfig, getStatus, connect, disconnect, testConnection } =
  mcpStore

// UI 状态
const showNewMCPForm = ref(false)
const testResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const showImportPanel = ref(false)
const importJsonContent = ref('')
const isImporting = ref(false)

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

function validateMCPConfig(config: MCPServerConfig): string {
  if (!config.name.trim()) {
    return '请输入服务器名称'
  }

  if (config.transport === 'stdio') {
    if (!config.command?.trim()) {
      return `MCP 服务“${config.name}”的执行命令不能为空`
    }
  } else if (!config.url?.trim()) {
    return `MCP 服务“${config.name}”的服务地址不能为空`
  }

  return ''
}

// 切换 MCP 服务器展开状态
function toggleMCPExpand(name: string): void {
  mcpStore.toggleServerExpanded(name)
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
  const validationMessage = validateMCPConfig(config)
  if (validationMessage) {
    showError(validationMessage)
    return
  }

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
    expandedServers.value.delete(name)
    emit('mcp-updated')
  }
}

// 保存 MCP 配置
async function handleSave(config: MCPServerConfig): Promise<boolean> {
  const validationMessage = validateMCPConfig(config)
  if (validationMessage) {
    showError(validationMessage)
    return false
  }

  const success = await saveConfig(config)
  if (success) {
    emit('mcp-updated')
  }
  return success
}

// 切换 MCP 启用状态
async function handleToggleEnabled(config: MCPServerConfig): Promise<void> {
  const success = await handleSave(config)
  if (success && !config.enabled) {
    await handleDisconnect(config.name)
  }
}

// 添加新 MCP 配置
async function handleAddNew(config: MCPServerConfig): Promise<void> {
  const validationMessage = validateMCPConfig(config)
  if (validationMessage) {
    showError(validationMessage)
    return
  }

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

// 切换导入面板显示状态
function toggleImportPanel(): void {
  showImportPanel.value = !showImportPanel.value
  if (!showImportPanel.value) {
    importJsonContent.value = ''
  }
}

// 导入 MCP 配置
async function importMCPConfigs(): Promise<void> {
  const jsonContent = importJsonContent.value.trim()
  if (!jsonContent) {
    showError('请输入 MCP 配置 JSON')
    return
  }

  isImporting.value = true

  try {
    const result = await window.api.mcp.importConfigs(jsonContent)
    if (result.success) {
      showSuccess(`成功导入 ${result.imported} 个配置`)
      if (result.errors.length > 0) {
        console.warn('导入过程中的错误:', result.errors)
      }
      importJsonContent.value = ''
      showImportPanel.value = false
      await loadConfigs()
      emit('mcp-updated')
    } else {
      showError(`导入失败: ${result.errors.join(', ')}`)
    }
  } catch (error) {
    showError(`导入失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    isImporting.value = false
  }
}

// 组件挂载时加载配置并设置状态监听
onMounted(() => {
  loadConfigs()
  mcpStore.setupStatusListener()
})

// 组件卸载时清理监听
onUnmounted(() => {
  mcpStore.cleanupStatusListener()
})
</script>

<template>
  <div class="tab-content">
    <!-- 操作按钮 -->
    <div class="mcp-actions-bar">
      <button class="btn btn-small" @click="toggleImportPanel">
        {{ showImportPanel ? '收起导入' : '导入配置' }}
      </button>
    </div>

    <div v-if="showImportPanel" class="import-panel">
      <label class="import-label" for="mcp-import-json">粘贴 MCP 配置 JSON</label>
      <textarea
        id="mcp-import-json"
        v-model="importJsonContent"
        class="input import-textarea"
        placeholder='例如：{"mcpServers":{"server-name":{"command":"npx","args":["-y","some-mcp"]}}}'
      />
      <div class="import-actions">
        <button class="btn btn-small" :disabled="isImporting" @click="importMCPConfigs">
          {{ isImporting ? '导入中...' : '确认导入' }}
        </button>
        <button
          class="btn btn-small btn-secondary"
          :disabled="isImporting"
          @click="toggleImportPanel"
        >
          取消
        </button>
      </div>
    </div>

    <!-- MCP 服务器列表 -->
    <div class="mcp-server-list">
      <MCPServerItem
        v-for="config in mcpConfigs"
        :key="config.name"
        :config="config"
        :status="getStatus(config.name)"
        :expanded="expandedServers.has(config.name)"
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
    <button v-if="!showNewMCPForm" class="btn add-mcp-btn" @click="showNewMCPForm = true">
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

.import-panel {
  margin-bottom: 1rem;
  padding: 12px;
  border: 1px solid var(--theme-border, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  background: var(--glass-white-03, rgba(255, 255, 255, 0.03));
}

.import-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--theme-text);
}

.import-textarea {
  width: 100%;
  min-height: 180px;
  resize: vertical;
  font-family: var(--theme-font-mono, monospace);
  font-size: 12px;
  line-height: 1.5;
}

.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.mcp-server-list {
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

.add-mcp-btn {
  width: 100%;
  padding: 12px;
  border-style: dashed;
  color: var(--theme-text-secondary);
}

.add-mcp-btn:hover {
  color: var(--theme-accent);
  border-color: var(--theme-accent);
}
</style>
