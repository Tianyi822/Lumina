<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import MCPServerItem from '../mcp/MCPServerItem.vue'
import MCPNewServerForm from '../mcp/MCPNewServerForm.vue'
import { useMCPStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { MCPServerConfig } from '@renderer/types'

interface Emits {
  (e: 'mcp-updated'): void
}

const emit = defineEmits<Emits>()

// 使用 MCP Store
const mcpStore = useZustandStore(useMCPStore)

const notify = useNotification()

// UI 状态
const showNewMCPForm = ref(false)
const testResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const showImportPanel = ref(false)
const importJsonContent = ref('')
const isImporting = ref(false)

// 导入 JSON 示例
const importPlaceholder = `例如：
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "some-mcp"]
    }
  }
}`

// 显示消息
function showError(message: string): void {
  notify.error('MCP 服务', message, { source: 'settings' })
}

function showSuccess(message: string): void {
  notify.success('MCP 服务', message, { source: 'settings' })
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
  const success = await mcpStore.connect(
    name,
    (msg) => showSuccess(msg),
    (msg) => showError(msg)
  )
  if (success) {
    await mcpStore.loadConfigs()
    emit('mcp-updated')
  }
}

// 断开 MCP 服务器
async function handleDisconnect(name: string): Promise<void> {
  const success = await mcpStore.disconnect(name, (msg) => showError(msg))
  if (success) {
    await mcpStore.loadConfigs()
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

  const success = await mcpStore.testConnection(
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
  const success = await mcpStore.deleteConfig(name)
  if (success) {
    mcpStore.expandedServers.delete(name)
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

  const success = await mcpStore.saveConfig(config)
  if (success) {
    emit('mcp-updated')
  }
  return success
}

// 添加新 MCP 配置
async function handleAddNew(config: MCPServerConfig): Promise<void> {
  const validationMessage = validateMCPConfig(config)
  if (validationMessage) {
    showError(validationMessage)
    return
  }

  const success = await mcpStore.saveConfig(config)
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
        window.api.logger.warn('[MCPSettings] 导入过程中存在错误', {
          errors: result.errors
        })
      }
      importJsonContent.value = ''
      showImportPanel.value = false
      await mcpStore.loadConfigs()
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
  mcpStore.loadConfigs()
  mcpStore.setupStatusListener()
})

// 组件卸载时清理监听
onUnmounted(() => {
  mcpStore.cleanupStatusListener()
})
</script>

<template>
  <div class="sm-settings-page tab-content">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">MCP 服务配置</h2>
      <p class="sm-settings-page__description">
        管理工具服务的连接、传输方式和导入配置，保持与聊天工作区同一套工程控制台语言。
      </p>
    </header>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">服务清单</h3>
          <p class="sm-settings-page__section-description">
            当前共 {{ mcpStore.configs.length }} 个 MCP 服务配置，可逐项测试、连接或编辑。
          </p>
        </div>
      </div>

      <div class="mcp-server-list">
        <MCPServerItem
          v-for="config in mcpStore.configs"
          :key="config.name"
          :config="config"
          :status="mcpStore.getStatus(config.name)"
          :expanded="mcpStore.expandedServers.has(config.name)"
          :connecting="mcpStore.connecting === config.name"
          :testing="mcpStore.testing === config.name"
          @toggle-expand="toggleMCPExpand"
          @connect="handleConnect"
          @disconnect="handleDisconnect"
          @delete="handleDelete"
          @test="handleTest"
          @save="handleSave"
        />

        <div v-if="mcpStore.configs.length === 0 && !showNewMCPForm" class="sm-settings-empty">
          <p>暂无 MCP 服务配置</p>
        </div>
      </div>

      <MCPNewServerForm
        v-if="showNewMCPForm"
        :existing-names="mcpStore.configs.map((c) => c.name)"
        @submit="handleAddNew"
        @cancel="showNewMCPForm = false"
        @test="handleTestNew"
      />

      <div v-if="!showNewMCPForm" class="sm-settings-actions settings-actions">
        <button class="sm-button add-mcp-btn" @click="showNewMCPForm = true">
          添加 MCP 服务器
        </button>
        <button class="sm-button import-btn" @click="toggleImportPanel">
          {{ showImportPanel ? '收起导入' : '导入 JSON 配置' }}
        </button>
      </div>

      <div v-if="showImportPanel && !showNewMCPForm" class="import-panel">
        <label class="import-label" for="mcp-import-json">粘贴 MCP 配置 JSON</label>
        <textarea
          id="mcp-import-json"
          v-model="importJsonContent"
          class="sm-textarea import-textarea"
          :placeholder="importPlaceholder"
        />
        <div class="import-actions">
          <button
            class="sm-button sm-button--small sm-button--primary"
            :disabled="isImporting"
            @click="importMCPConfigs"
          >
            {{ isImporting ? '导入中...' : '确认导入' }}
          </button>
          <button
            class="sm-button sm-button--small sm-button--secondary"
            :disabled="isImporting"
            @click="toggleImportPanel"
          >
            取消
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.import-panel {
  padding: 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
}

.import-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.import-textarea {
  width: 100%;
  min-height: 180px;
  resize: vertical;
  font-family: var(--sm-font-mono);
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
}

.add-mcp-btn {
  border-style: dashed;
  color: var(--sm-color-text-secondary);
}

.add-mcp-btn:hover {
  color: var(--sm-color-accent-hover);
  border-color: var(--sm-color-border-accent);
}

.import-btn {
  border-style: dashed;
  color: var(--sm-color-text-secondary);
}

.import-btn:hover {
  color: var(--sm-color-accent-hover);
  border-color: var(--sm-color-border-accent);
}

.settings-actions {
  justify-content: stretch;
}

.settings-actions > button {
  flex: 1;
}

@media (max-width: 640px) {
  .settings-actions {
    flex-direction: column;
  }
}
</style>
