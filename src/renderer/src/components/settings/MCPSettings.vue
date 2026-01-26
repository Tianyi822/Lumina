<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, toRaw } from 'vue'
import type { MCPServerConfig, MCPConnectionStatus } from '@renderer/types'

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

const mcpConfigs = ref<MCPServerConfig[]>([])
const mcpStatuses = ref<MCPConnectionStatus[]>([])
const expandedMCPServers = ref<Set<string>>(new Set())
const showNewMCPForm = ref(false)
const testingMCP = ref<string | null>(null)
const connectingMCP = ref<string | null>(null)
const testingNewMCP = ref(false)

// 新 MCP 服务器表单
const newMCPConfig = reactive<MCPServerConfig>({
  name: '',
  transport: 'stdio',
  enabled: true,
  command: '',
  args: [],
  env: {},
  url: '',
  headers: {}
})
const newMCPArgsText = ref('')
const newMCPEnvText = ref('')
const newMCPHeadersText = ref('')

// MCP 状态变更监听器
let mcpStatusUnsubscribe: (() => void) | null = null

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

// 加载 MCP 配置
async function loadMCPConfigs(): Promise<void> {
  try {
    mcpConfigs.value = await window.api.mcp.listConfigs()
    mcpStatuses.value = await window.api.mcp.getStatus()
  } catch (error) {
    console.error('加载 MCP 配置失败:', error)
  }
}

// 获取 MCP 服务器连接状态
function getMCPStatus(name: string): MCPConnectionStatus | undefined {
  return mcpStatuses.value.find((s) => s.serverName === name)
}

// 切换 MCP 服务器展开状态
function toggleMCPExpand(name: string): void {
  if (expandedMCPServers.value.has(name)) {
    expandedMCPServers.value.delete(name)
  } else {
    expandedMCPServers.value.add(name)
  }
}

// 测试 MCP 连接
async function testMCPConnection(config: MCPServerConfig): Promise<void> {
  testingMCP.value = config.name
  emit('update:errorMessage', '')
  try {
    // 将 Vue 响应式对象转换为普通对象，以便通过 IPC 传输
    const plainConfig = JSON.parse(JSON.stringify(toRaw(config)))
    const result = await window.api.mcp.testConnection(plainConfig)
    if (result.success) {
      showSuccess(`${config.name} 连接测试成功，发现 ${result.tools?.length || 0} 个工具`)
    } else {
      showError(`连接测试失败: ${result.error}`)
    }
  } catch (error) {
    showError(`测试失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    testingMCP.value = null
  }
}

// 连接 MCP 服务器
async function connectMCP(name: string): Promise<void> {
  connectingMCP.value = name
  emit('update:errorMessage', '')
  try {
    const result = await window.api.mcp.connect(name)
    if (result.success) {
      showSuccess(`${name} 已连接`)
      await loadMCPConfigs()
      emit('mcp-updated')
    } else {
      showError(`连接失败: ${result.error}`)
    }
  } catch (error) {
    showError(`连接失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    connectingMCP.value = null
  }
}

// 断开 MCP 服务器
async function disconnectMCP(name: string): Promise<void> {
  try {
    await window.api.mcp.disconnect(name)
    await loadMCPConfigs()
    emit('mcp-updated')
  } catch (error) {
    showError(`断开失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 删除 MCP 配置
async function deleteMCPConfig(name: string): Promise<void> {
  try {
    await window.api.mcp.deleteConfig(name)
    await loadMCPConfigs()
    expandedMCPServers.value.delete(name)
    emit('mcp-updated')
  } catch (error) {
    showError(`删除失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 保存 MCP 配置
async function saveMCPConfig(config: MCPServerConfig): Promise<void> {
  try {
    // 将 Vue 响应式对象转换为普通对象，以便通过 IPC 传输
    const plainConfig = JSON.parse(JSON.stringify(toRaw(config)))
    const result = await window.api.mcp.saveConfig(plainConfig)
    if (result.success) {
      await loadMCPConfigs()
      emit('mcp-updated')
    } else {
      showError(`保存失败: ${result.error}`)
    }
  } catch (error) {
    showError(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 切换 MCP 启用状态
async function toggleMCPEnabled(config: MCPServerConfig): Promise<void> {
  // 将 Vue 响应式对象转换为普通对象，以便通过 IPC 传输
  const plainConfig = JSON.parse(JSON.stringify(toRaw(config)))
  const updatedConfig = { ...plainConfig, enabled: !plainConfig.enabled }
  await saveMCPConfig(updatedConfig)
  if (!updatedConfig.enabled) {
    await disconnectMCP(config.name)
  }
}

// 测试新建的 MCP 配置
async function testNewMCPConnection(): Promise<void> {
  if (!newMCPConfig.name.trim()) {
    showError('请输入服务器名称')
    return
  }

  // 验证配置
  if (newMCPConfig.transport === 'stdio') {
    if (!newMCPConfig.command?.trim()) {
      showError('请输入执行命令')
      return
    }
  } else {
    if (!newMCPConfig.url?.trim()) {
      showError('请输入服务地址')
      return
    }
  }

  // 构建配置对象
  const config: MCPServerConfig = {
    ...toRaw(newMCPConfig),
    args: newMCPArgsText.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s),
    env: parseKeyValueText(newMCPEnvText.value),
    headers: parseKeyValueText(newMCPHeadersText.value)
  }

  testingNewMCP.value = true
  emit('update:errorMessage', '')
  try {
    const result = await window.api.mcp.testConnection(config)
    if (result.success) {
      showSuccess(`连接测试成功，发现 ${result.tools?.length || 0} 个工具`)
    } else {
      showError(`连接测试失败: ${result.error}`)
    }
  } catch (error) {
    showError(`测试失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    testingNewMCP.value = false
  }
}

// 解析键值对文本
function parseKeyValueText(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = text.split('\n').filter((line) => line.trim())
  for (const line of lines) {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join('=').trim()
    }
  }
  return result
}

// 添加新 MCP 配置
async function addNewMCPConfig(): Promise<void> {
  if (!newMCPConfig.name.trim()) {
    showError('请输入服务器名称')
    return
  }

  // 检查名称是否已存在
  if (mcpConfigs.value.some((c) => c.name === newMCPConfig.name)) {
    showError('该名称已存在')
    return
  }

  // 验证配置
  if (newMCPConfig.transport === 'stdio') {
    if (!newMCPConfig.command?.trim()) {
      showError('请输入执行命令')
      return
    }
  } else {
    if (!newMCPConfig.url?.trim()) {
      showError('请输入服务地址')
      return
    }
  }

  // 解析参数
  const config: MCPServerConfig = {
    ...toRaw(newMCPConfig),
    args: newMCPArgsText.value
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s),
    env: parseKeyValueText(newMCPEnvText.value),
    headers: parseKeyValueText(newMCPHeadersText.value)
  }

  try {
    const result = await window.api.mcp.saveConfig(config)
    if (result.success) {
      await loadMCPConfigs()
      resetNewMCPForm()
      emit('mcp-updated')
    } else {
      showError(`添加失败: ${result.error}`)
    }
  } catch (error) {
    showError(`添加失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// 重置新 MCP 表单
function resetNewMCPForm(): void {
  showNewMCPForm.value = false
  newMCPConfig.name = ''
  newMCPConfig.transport = 'stdio'
  newMCPConfig.enabled = true
  newMCPConfig.command = ''
  newMCPConfig.url = ''
  newMCPArgsText.value = ''
  newMCPEnvText.value = ''
  newMCPHeadersText.value = ''
}

// 导入 MCP 配置
async function importMCPConfigs(): Promise<void> {
  // 创建文件输入元素
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      const result = await window.api.mcp.importConfigs(content)
      if (result.success) {
        showSuccess(`成功导入 ${result.imported} 个配置`)
        await loadMCPConfigs()
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

onMounted(() => {
  loadMCPConfigs()
  // 监听 MCP 状态变更
  mcpStatusUnsubscribe = window.api.mcp.onStatusChange(() => {
    loadMCPConfigs()
  })
})

onUnmounted(() => {
  // 取消 MCP 状态监听
  if (mcpStatusUnsubscribe) {
    mcpStatusUnsubscribe()
  }
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
      <div v-for="config in mcpConfigs" :key="config.name" class="model-item">
        <div class="model-header" @click="toggleMCPExpand(config.name)">
          <span class="expand-icon">{{ expandedMCPServers.has(config.name) ? '▼' : '▶' }}</span>
          <span class="model-name">{{ config.name }}</span>
          <!-- 连接状态指示器 -->
          <span
            class="status-indicator"
            :class="{
              connected: getMCPStatus(config.name)?.connected,
              error: getMCPStatus(config.name)?.error
            }"
            :title="getMCPStatus(config.name)?.error || ''"
          >
            {{ getMCPStatus(config.name)?.connected ? '已连接' : '未连接' }}
          </span>
          <span class="transport-badge">{{ config.transport }}</span>
          <div class="model-actions">
            <button
              v-if="!getMCPStatus(config.name)?.connected"
              class="btn btn-small"
              :disabled="connectingMCP === config.name"
              @click.stop="connectMCP(config.name)"
            >
              {{ connectingMCP === config.name ? '连接中...' : '连接' }}
            </button>
            <button v-else class="btn btn-small" @click.stop="disconnectMCP(config.name)">
              断开
            </button>
            <button
              class="btn btn-small"
              :disabled="testingMCP === config.name"
              @click.stop="testMCPConnection(config)"
            >
              {{ testingMCP === config.name ? '测试中...' : '测试' }}
            </button>
            <button
              class="btn btn-small btn-danger-text"
              @click.stop="deleteMCPConfig(config.name)"
            >
              删除
            </button>
          </div>
        </div>

        <!-- 展开的详情 -->
        <div v-if="expandedMCPServers.has(config.name)" class="model-details">
          <div class="form-group">
            <label>传输类型</label>
            <select v-model="config.transport" class="input" @change="saveMCPConfig(config)">
              <option value="stdio">stdio (本地进程)</option>
              <option value="sse">SSE (Server-Sent Events)</option>
              <option value="streamableHttp">Streamable HTTP</option>
            </select>
          </div>

          <!-- stdio 配置 -->
          <template v-if="config.transport === 'stdio'">
            <div class="form-group">
              <label>执行命令</label>
              <input
                v-model="config.command"
                type="text"
                class="input"
                placeholder="例如: npx, node, python"
                @blur="saveMCPConfig(config)"
              />
            </div>
            <div class="form-group">
              <label>命令参数 (每行一个)</label>
              <textarea
                :value="config.args?.join('\n') || ''"
                class="input textarea-small"
                placeholder="-y&#10;@modelcontextprotocol/server-xxx"
                @blur="
                  (e) => {
                    config.args = (e.target as HTMLTextAreaElement).value
                      .split('\n')
                      .filter((s) => s.trim())
                    saveMCPConfig(config)
                  }
                "
              ></textarea>
            </div>
            <div class="form-group">
              <label>环境变量 (KEY=VALUE 格式，每行一个)</label>
              <textarea
                :value="
                  Object.entries(config.env || {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join('\n')
                "
                class="input textarea-small"
                placeholder="API_KEY=xxx"
                @blur="
                  (e) => {
                    config.env = parseKeyValueText((e.target as HTMLTextAreaElement).value)
                    saveMCPConfig(config)
                  }
                "
              ></textarea>
            </div>
          </template>

          <!-- HTTP/SSE 配置 -->
          <template v-else>
            <div class="form-group">
              <label>服务地址</label>
              <input
                v-model="config.url"
                type="text"
                class="input"
                placeholder="https://example.com/mcp"
                @blur="saveMCPConfig(config)"
              />
            </div>
            <div class="form-group">
              <label>认证头 (KEY=VALUE 格式，每行一个)</label>
              <textarea
                :value="
                  Object.entries(config.headers || {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join('\n')
                "
                class="input textarea-small"
                placeholder="Authorization=Bearer xxx"
                @blur="
                  (e) => {
                    config.headers = parseKeyValueText((e.target as HTMLTextAreaElement).value)
                    saveMCPConfig(config)
                  }
                "
              ></textarea>
            </div>
          </template>

          <!-- 启用状态 -->
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" :checked="config.enabled" @change="toggleMCPEnabled(config)" />
              <span>启用此服务器</span>
            </label>
          </div>

          <!-- 工具列表 -->
          <div v-if="getMCPStatus(config.name)?.connected" class="tools-section">
            <h4 class="tools-title">
              可用工具 ({{ getMCPStatus(config.name)?.tools.length || 0 }})
            </h4>
            <div class="tools-list">
              <div
                v-for="tool in getMCPStatus(config.name)?.tools || []"
                :key="tool.name"
                class="tool-item"
              >
                <span class="tool-name">{{ tool.name }}</span>
                <span class="tool-desc">{{ tool.description }}</span>
              </div>
              <div v-if="!getMCPStatus(config.name)?.tools?.length" class="empty-tools">
                暂无可用工具
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="mcpConfigs.length === 0 && !showNewMCPForm" class="empty-state">
        <p>暂无 MCP 服务配置</p>
      </div>
    </div>

    <!-- 添加新 MCP 服务器表单 -->
    <div v-if="showNewMCPForm" class="new-model-form">
      <h3 class="form-section-title">添加 MCP 服务器</h3>
      <div class="form-group">
        <label>服务器名称 <span class="required">*</span></label>
        <input
          v-model="newMCPConfig.name"
          type="text"
          class="input"
          placeholder="例如: filesystem, github"
        />
      </div>
      <div class="form-group">
        <label>传输类型</label>
        <select v-model="newMCPConfig.transport" class="input">
          <option value="stdio">stdio (本地进程)</option>
          <option value="sse">SSE (Server-Sent Events)</option>
          <option value="streamableHttp">Streamable HTTP</option>
        </select>
      </div>

      <!-- stdio 配置 -->
      <template v-if="newMCPConfig.transport === 'stdio'">
        <div class="form-group">
          <label>执行命令 <span class="required">*</span></label>
          <input
            v-model="newMCPConfig.command"
            type="text"
            class="input"
            placeholder="例如: npx, node, python"
          />
        </div>
        <div class="form-group">
          <label>命令参数 (每行一个)</label>
          <textarea
            v-model="newMCPArgsText"
            class="input textarea-small"
            placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;/path/to/dir"
          ></textarea>
        </div>
        <div class="form-group">
          <label>环境变量 (KEY=VALUE 格式，每行一个)</label>
          <textarea
            v-model="newMCPEnvText"
            class="input textarea-small"
            placeholder="API_KEY=your-api-key"
          ></textarea>
        </div>
      </template>

      <!-- HTTP/SSE 配置 -->
      <template v-else>
        <div class="form-group">
          <label>服务地址 <span class="required">*</span></label>
          <input
            v-model="newMCPConfig.url"
            type="text"
            class="input"
            placeholder="https://example.com/mcp"
          />
        </div>
        <div class="form-group">
          <label>认证头 (KEY=VALUE 格式，每行一个)</label>
          <textarea
            v-model="newMCPHeadersText"
            class="input textarea-small"
            placeholder="Authorization=Bearer your-token"
          ></textarea>
        </div>
      </template>

      <div class="form-actions">
        <button class="btn" @click="resetNewMCPForm">取消</button>
        <button class="btn" :disabled="testingNewMCP" @click="testNewMCPConnection">
          {{ testingNewMCP ? '测试中...' : '测试连接' }}
        </button>
        <button class="btn-primary" @click="addNewMCPConfig">添加</button>
      </div>
    </div>

    <!-- 添加 MCP 按钮 -->
    <button v-if="!showNewMCPForm" class="btn add-model-btn" @click="showNewMCPForm = true">
      + 添加 MCP 服务器
    </button>
  </div>
</template>

<style scoped>
.tab-content {
  min-height: 300px;
}

.mcp-actions-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
  gap: 8px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.model-item {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
}

.model-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.model-header:hover {
  background-color: var(--theme-bg-hover);
}

.expand-icon {
  font-size: 10px;
  color: var(--theme-text-secondary);
  margin-right: 10px;
  width: 12px;
}

.model-name {
  font-weight: 500;
  color: var(--theme-text);
  flex: 1;
}

.model-actions {
  display: flex;
  gap: 8px;
}

.model-details {
  padding: 16px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.required {
  color: var(--theme-danger);
}

.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 20px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.form-section-title:first-child {
  margin-top: 0;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--theme-border);
}

.new-model-form {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}

.new-model-form .form-section-title {
  margin-top: 0;
  border-bottom: none;
  padding-bottom: 0;
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

.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--theme-text-secondary);
}

.btn-small {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-danger-text {
  color: var(--theme-danger);
  border-color: transparent;
}

.btn-danger-text:hover {
  background-color: rgba(248, 81, 73, 0.1);
  border-color: var(--theme-danger);
}

.status-indicator {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  margin-right: 8px;
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.status-indicator.connected {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-accent);
}

.status-indicator.error {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--theme-danger);
}

.transport-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
  margin-right: 12px;
  font-family: monospace;
}

.textarea-small {
  min-height: 60px;
  resize: vertical;
  font-family: var(--theme-font);
  line-height: 1.5;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--theme-text);
}

.checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.tools-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--theme-border);
}

.tools-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 12px 0;
}

.tools-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.tool-item {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  background-color: var(--theme-bg-secondary);
  border-radius: 4px;
  border: 1px solid var(--theme-border);
}

.tool-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-accent);
  font-family: monospace;
}

.tool-desc {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 4px;
}

.empty-tools {
  font-size: 12px;
  color: var(--theme-text-secondary);
  font-style: italic;
}
</style>
