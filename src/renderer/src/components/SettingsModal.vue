<script setup lang="ts">
import { ref, reactive, onMounted, toRaw, onUnmounted } from 'vue'

interface LLMConfig {
  base_url: string
  api_key: string
  model_name: string
  temperature: number
  max_tokens: number
}

interface LLMConfigs {
  [key: string]: LLMConfig
}

interface ThemeColors {
  background: string
  backgroundSecondary: string
  text: string
  textSecondary: string
  accent: string
  border: string
}

interface ThemeConfig {
  name: string
  colors?: ThemeColors
}

interface AppConfig {
  theme: ThemeConfig
  llm_configs: LLMConfigs
  default_model: string
  compression_threshold: number
  enable_auto_compression: boolean
}

// MCP 相关类型
type MCPTransportType = 'stdio' | 'sse' | 'streamableHttp'

interface MCPServerConfig {
  name: string
  transport: MCPTransportType
  enabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

interface MCPConnectionStatus {
  serverName: string
  connected: boolean
  error?: string
  tools: { name: string; description: string }[]
}

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'config-updated'): void
  (e: 'mcp-updated'): void
}>()

// 当前激活的 Tab
const activeTab = ref<'theme' | 'model' | 'mcp'>('model')

// 加载状态
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

// 主题配置
const themeConfig = reactive<ThemeConfig>({
  name: 'terminal',
  colors: {
    background: '#0d1117',
    backgroundSecondary: '#161b22',
    text: '#c9d1d9',
    textSecondary: '#8b949e',
    accent: '#3fb950',
    border: '#30363d'
  }
})

// 模型配置
const llmConfigs = reactive<LLMConfigs>({})
const defaultModel = ref('')

// 新模型表单
const showNewModelForm = ref(false)
const newModelKey = ref('')
const newModelConfig = reactive<LLMConfig>({
  base_url: '',
  api_key: '',
  model_name: '',
  temperature: 0.7,
  max_tokens: 4096
})

// 展开的模型配置项
const expandedModels = ref<Set<string>>(new Set())

// ==================== MCP 相关状态 ====================
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

// 加载配置
async function loadConfig(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const config = (await window.api.config.getConfig()) as AppConfig | null
    if (config) {
      // 加载主题配置
      if (config.theme) {
        themeConfig.name = config.theme.name || 'terminal'
        if (config.theme.colors) {
          Object.assign(themeConfig.colors!, config.theme.colors)
        }
      }
      // 加载模型配置
      if (config.llm_configs) {
        Object.keys(llmConfigs).forEach((key) => delete llmConfigs[key])
        Object.assign(llmConfigs, config.llm_configs)
      }
      defaultModel.value = config.default_model || ''
    }
    // 加载 MCP 配置
    await loadMCPConfigs()
  } catch (error) {
    errorMessage.value = `加载配置失败: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    loading.value = false
  }
}

// ==================== MCP 相关方法 ====================

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
  errorMessage.value = ''
  try {
    // 将 Vue 响应式对象转换为普通对象，以便通过 IPC 传输
    const plainConfig = JSON.parse(JSON.stringify(toRaw(config)))
    const result = await window.api.mcp.testConnection(plainConfig)
    if (result.success) {
      successMessage.value = `${config.name} 连接测试成功，发现 ${result.tools?.length || 0} 个工具`
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
    } else {
      errorMessage.value = `连接测试失败: ${result.error}`
    }
  } catch (error) {
    errorMessage.value = `测试失败: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    testingMCP.value = null
  }
}

// 连接 MCP 服务器
async function connectMCP(name: string): Promise<void> {
  connectingMCP.value = name
  errorMessage.value = ''
  try {
    const result = await window.api.mcp.connect(name)
    if (result.success) {
      successMessage.value = `${name} 已连接`
      await loadMCPConfigs()
      emit('mcp-updated')
      setTimeout(() => {
        successMessage.value = ''
      }, 2000)
    } else {
      errorMessage.value = `连接失败: ${result.error}`
    }
  } catch (error) {
    errorMessage.value = `连接失败: ${error instanceof Error ? error.message : String(error)}`
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
    errorMessage.value = `断开失败: ${error instanceof Error ? error.message : String(error)}`
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
    errorMessage.value = `删除失败: ${error instanceof Error ? error.message : String(error)}`
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
      errorMessage.value = `保存失败: ${result.error}`
    }
  } catch (error) {
    errorMessage.value = `保存失败: ${error instanceof Error ? error.message : String(error)}`
  }
}

// 添加新 MCP 配置
async function addNewMCPConfig(): Promise<void> {
  if (!newMCPConfig.name.trim()) {
    errorMessage.value = '请输入服务器名称'
    return
  }

  // 检查名称是否已存在
  if (mcpConfigs.value.some((c) => c.name === newMCPConfig.name)) {
    errorMessage.value = '该名称已存在'
    return
  }

  // 验证配置
  if (newMCPConfig.transport === 'stdio') {
    if (!newMCPConfig.command?.trim()) {
      errorMessage.value = '请输入执行命令'
      return
    }
  } else {
    if (!newMCPConfig.url?.trim()) {
      errorMessage.value = '请输入服务地址'
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
      errorMessage.value = `添加失败: ${result.error}`
    }
  } catch (error) {
    errorMessage.value = `添加失败: ${error instanceof Error ? error.message : String(error)}`
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
        successMessage.value = `成功导入 ${result.imported} 个配置`
        await loadMCPConfigs()
        emit('mcp-updated')
        setTimeout(() => {
          successMessage.value = ''
        }, 3000)
      } else {
        errorMessage.value = `导入失败: ${result.errors.join(', ')}`
      }
    } catch (error) {
      errorMessage.value = `导入失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  input.click()
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
    errorMessage.value = '请输入服务器名称'
    return
  }

  // 验证配置
  if (newMCPConfig.transport === 'stdio') {
    if (!newMCPConfig.command?.trim()) {
      errorMessage.value = '请输入执行命令'
      return
    }
  } else {
    if (!newMCPConfig.url?.trim()) {
      errorMessage.value = '请输入服务地址'
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
  errorMessage.value = ''
  try {
    const result = await window.api.mcp.testConnection(config)
    if (result.success) {
      successMessage.value = `连接测试成功，发现 ${result.tools?.length || 0} 个工具`
      setTimeout(() => {
        successMessage.value = ''
      }, 3000)
    } else {
      errorMessage.value = `连接测试失败: ${result.error}`
    }
  } catch (error) {
    errorMessage.value = `测试失败: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    testingNewMCP.value = false
  }
}

// 保存配置
async function saveConfig(): Promise<void> {
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    // 将 reactive 对象转换为普通对象，以便通过 IPC 传输
    const plainThemeConfig = JSON.parse(JSON.stringify(toRaw(themeConfig)))
    const plainLlmConfigs = JSON.parse(JSON.stringify(toRaw(llmConfigs)))

    const result = await window.api.config.updateConfig({
      theme: plainThemeConfig,
      llm_configs: plainLlmConfigs,
      default_model: defaultModel.value
    })
    if (result.success) {
      successMessage.value = '配置保存成功'
      emit('config-updated')
      setTimeout(() => {
        successMessage.value = ''
      }, 2000)
    } else {
      errorMessage.value = result.error || '保存失败'
    }
  } catch (error) {
    errorMessage.value = `保存配置失败: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    saving.value = false
  }
}

// 添加新模型配置
function addNewModel(): void {
  if (!newModelKey.value.trim()) {
    errorMessage.value = '请输入配置名称'
    return
  }
  if (llmConfigs[newModelKey.value]) {
    errorMessage.value = '该配置名称已存在'
    return
  }
  if (!newModelConfig.base_url.trim()) {
    errorMessage.value = '请输入 API Base URL'
    return
  }
  if (!newModelConfig.api_key.trim()) {
    errorMessage.value = '请输入 API Key'
    return
  }
  if (!newModelConfig.model_name.trim()) {
    errorMessage.value = '请输入模型名称'
    return
  }

  llmConfigs[newModelKey.value] = { ...newModelConfig }

  // 如果是第一个模型，设为默认
  if (Object.keys(llmConfigs).length === 1) {
    defaultModel.value = newModelKey.value
  }

  // 重置表单
  resetNewModelForm()
  errorMessage.value = ''
}

// 重置新模型表单
function resetNewModelForm(): void {
  showNewModelForm.value = false
  newModelKey.value = ''
  newModelConfig.base_url = ''
  newModelConfig.api_key = ''
  newModelConfig.model_name = ''
  newModelConfig.temperature = 0.7
  newModelConfig.max_tokens = 4096
}

// 删除模型配置
function deleteModel(key: string): void {
  delete llmConfigs[key]
  expandedModels.value.delete(key)
  if (defaultModel.value === key) {
    const keys = Object.keys(llmConfigs)
    defaultModel.value = keys.length > 0 ? keys[0] : ''
  }
}

// 切换模型展开状态
function toggleModelExpand(key: string): void {
  if (expandedModels.value.has(key)) {
    expandedModels.value.delete(key)
  } else {
    expandedModels.value.add(key)
  }
}

// 设置默认模型
function setDefaultModel(key: string): void {
  defaultModel.value = key
}

// 关闭弹窗
function handleClose(): void {
  emit('close')
}

// 点击遮罩关闭
function handleOverlayClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    handleClose()
  }
}

onMounted(() => {
  loadConfig()
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
  <div class="modal-overlay" @click="handleOverlayClick">
    <div class="modal-container">
      <!-- 模态框头部 -->
      <div class="modal-header">
        <h2 class="modal-title">设置</h2>
        <button class="btn close-btn" @click="handleClose">
          <span>×</span>
        </button>
      </div>

      <!-- Tab 切换 -->
      <div class="tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'model' }"
          @click="activeTab = 'model'"
        >
          模型配置
        </button>
        <button class="tab-btn" :class="{ active: activeTab === 'mcp' }" @click="activeTab = 'mcp'">
          MCP 服务
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'theme' }"
          @click="activeTab = 'theme'"
        >
          主题设置
        </button>
      </div>

      <!-- 内容区域 -->
      <div class="modal-content">
        <!-- 加载状态 -->
        <div v-if="loading" class="loading-state">
          <span>加载中...</span>
        </div>

        <!-- 模型配置 Tab -->
        <div v-else-if="activeTab === 'model'" class="tab-content">
          <!-- 已配置的模型列表 -->
          <div class="model-list">
            <div v-for="(config, key) in llmConfigs" :key="key" class="model-item">
              <div class="model-header" @click="toggleModelExpand(key as string)">
                <span class="expand-icon">{{ expandedModels.has(key as string) ? '▼' : '▶' }}</span>
                <span class="model-name">{{ key }}</span>
                <span v-if="defaultModel === key" class="default-badge">默认</span>
                <div class="model-actions">
                  <button
                    v-if="defaultModel !== key"
                    class="btn btn-small"
                    @click.stop="setDefaultModel(key as string)"
                  >
                    设为默认
                  </button>
                  <button
                    class="btn btn-small btn-danger-text"
                    @click.stop="deleteModel(key as string)"
                  >
                    删除
                  </button>
                </div>
              </div>
              <div v-if="expandedModels.has(key as string)" class="model-details">
                <div class="form-group">
                  <label>API Base URL</label>
                  <input
                    v-model="config.base_url"
                    type="text"
                    class="input"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div class="form-group">
                  <label>API Key</label>
                  <input
                    v-model="config.api_key"
                    type="password"
                    class="input"
                    placeholder="sk-..."
                  />
                </div>
                <div class="form-group">
                  <label>模型名称</label>
                  <input
                    v-model="config.model_name"
                    type="text"
                    class="input"
                    placeholder="gpt-4"
                  />
                </div>
                <div class="form-row">
                  <div class="form-group half">
                    <label>Temperature</label>
                    <input
                      v-model.number="config.temperature"
                      type="number"
                      class="input"
                      min="0"
                      max="2"
                      step="0.1"
                    />
                  </div>
                  <div class="form-group half">
                    <label>Max Tokens</label>
                    <input v-model.number="config.max_tokens" type="number" class="input" min="1" />
                  </div>
                </div>
              </div>
            </div>

            <!-- 空状态 -->
            <div
              v-if="Object.keys(llmConfigs).length === 0 && !showNewModelForm"
              class="empty-state"
            >
              <p>暂无模型配置</p>
            </div>
          </div>

          <!-- 添加新模型表单 -->
          <div v-if="showNewModelForm" class="new-model-form">
            <h3 class="form-section-title">添加新模型配置</h3>
            <div class="form-group">
              <label>配置名称 <span class="required">*</span></label>
              <input
                v-model="newModelKey"
                type="text"
                class="input"
                placeholder="例如: gpt4, claude3"
              />
            </div>
            <div class="form-group">
              <label>API Base URL <span class="required">*</span></label>
              <input
                v-model="newModelConfig.base_url"
                type="text"
                class="input"
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div class="form-group">
              <label>API Key <span class="required">*</span></label>
              <input
                v-model="newModelConfig.api_key"
                type="password"
                class="input"
                placeholder="sk-..."
              />
            </div>
            <div class="form-group">
              <label>模型名称 <span class="required">*</span></label>
              <input
                v-model="newModelConfig.model_name"
                type="text"
                class="input"
                placeholder="gpt-4"
              />
            </div>
            <div class="form-row">
              <div class="form-group half">
                <label>Temperature</label>
                <input
                  v-model.number="newModelConfig.temperature"
                  type="number"
                  class="input"
                  min="0"
                  max="2"
                  step="0.1"
                />
              </div>
              <div class="form-group half">
                <label>Max Tokens</label>
                <input
                  v-model.number="newModelConfig.max_tokens"
                  type="number"
                  class="input"
                  min="1"
                />
              </div>
            </div>
            <div class="form-actions">
              <button class="btn" @click="resetNewModelForm">取消</button>
              <button class="btn-primary" @click="addNewModel">添加</button>
            </div>
          </div>

          <!-- 添加模型按钮 -->
          <button
            v-if="!showNewModelForm"
            class="btn add-model-btn"
            @click="showNewModelForm = true"
          >
            + 添加模型配置
          </button>
        </div>

        <!-- MCP 配置 Tab -->
        <div v-else-if="activeTab === 'mcp'" class="tab-content">
          <!-- 操作按钮 -->
          <div class="mcp-actions-bar">
            <button class="btn btn-small" @click="importMCPConfigs">导入配置</button>
          </div>

          <!-- MCP 服务器列表 -->
          <div class="model-list">
            <div v-for="config in mcpConfigs" :key="config.name" class="model-item">
              <div class="model-header" @click="toggleMCPExpand(config.name)">
                <span class="expand-icon">{{
                  expandedMCPServers.has(config.name) ? '▼' : '▶'
                }}</span>
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
                          config.headers = parseKeyValueText(
                            (e.target as HTMLTextAreaElement).value
                          )
                          saveMCPConfig(config)
                        }
                      "
                    ></textarea>
                  </div>
                </template>

                <!-- 启用状态 -->
                <div class="form-group">
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      :checked="config.enabled"
                      @change="toggleMCPEnabled(config)"
                    />
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
              <button
                class="btn"
                :disabled="testingNewMCP"
                @click="testNewMCPConnection"
              >
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

        <!-- 主题设置 Tab -->
        <div v-else-if="activeTab === 'theme'" class="tab-content">
          <div class="form-group">
            <label>主题名称</label>
            <select v-model="themeConfig.name" class="input">
              <option value="terminal">Terminal (终端)</option>
            </select>
          </div>

          <h3 class="form-section-title">颜色配置</h3>
          <div class="color-grid">
            <div class="form-group">
              <label>主背景色</label>
              <div class="color-input-wrapper">
                <input v-model="themeConfig.colors!.background" type="color" class="color-picker" />
                <input
                  v-model="themeConfig.colors!.background"
                  type="text"
                  class="input color-text"
                />
              </div>
            </div>
            <div class="form-group">
              <label>次级背景色</label>
              <div class="color-input-wrapper">
                <input
                  v-model="themeConfig.colors!.backgroundSecondary"
                  type="color"
                  class="color-picker"
                />
                <input
                  v-model="themeConfig.colors!.backgroundSecondary"
                  type="text"
                  class="input color-text"
                />
              </div>
            </div>
            <div class="form-group">
              <label>主文字颜色</label>
              <div class="color-input-wrapper">
                <input v-model="themeConfig.colors!.text" type="color" class="color-picker" />
                <input v-model="themeConfig.colors!.text" type="text" class="input color-text" />
              </div>
            </div>
            <div class="form-group">
              <label>次级文字颜色</label>
              <div class="color-input-wrapper">
                <input
                  v-model="themeConfig.colors!.textSecondary"
                  type="color"
                  class="color-picker"
                />
                <input
                  v-model="themeConfig.colors!.textSecondary"
                  type="text"
                  class="input color-text"
                />
              </div>
            </div>
            <div class="form-group">
              <label>强调色</label>
              <div class="color-input-wrapper">
                <input v-model="themeConfig.colors!.accent" type="color" class="color-picker" />
                <input v-model="themeConfig.colors!.accent" type="text" class="input color-text" />
              </div>
            </div>
            <div class="form-group">
              <label>边框颜色</label>
              <div class="color-input-wrapper">
                <input v-model="themeConfig.colors!.border" type="color" class="color-picker" />
                <input v-model="themeConfig.colors!.border" type="text" class="input color-text" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 消息提示 -->
      <div v-if="errorMessage" class="message error-message">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="message success-message">
        {{ successMessage }}
      </div>

      <!-- 模态框底部 -->
      <div class="modal-footer">
        <button class="btn" @click="handleClose">取消</button>
        <button class="btn-primary" :disabled="saving" @click="saveConfig">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 600px;
  max-width: 90vw;
  max-height: 85vh;
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  box-shadow: var(--theme-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--theme-text-secondary);
  font-family: var(--theme-font);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: var(--theme-text);
  background-color: var(--theme-bg-secondary);
}

.tab-btn.active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.tab-content {
  min-height: 300px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--theme-text-secondary);
}

/* 模型列表 */
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

.default-badge {
  font-size: 11px;
  padding: 2px 8px;
  background-color: var(--theme-accent);
  color: var(--theme-bg);
  border-radius: 4px;
  margin-right: 12px;
}

.model-actions {
  display: flex;
  gap: 8px;
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

.model-details {
  padding: 16px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
}

/* 表单样式 */
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

.form-row {
  display: flex;
  gap: 16px;
}

.form-group.half {
  flex: 1;
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

/* 新模型表单 */
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

/* 添加模型按钮 */
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

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--theme-text-secondary);
}

/* 颜色配置 */
.color-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.color-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-picker {
  width: 40px;
  height: 36px;
  padding: 2px;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.color-text {
  flex: 1;
}

/* 消息提示 */
.message {
  padding: 10px 20px;
  font-size: 13px;
  flex-shrink: 0;
}

.error-message {
  background-color: rgba(248, 81, 73, 0.1);
  color: var(--theme-danger);
  border-top: 1px solid var(--theme-danger);
}

.success-message {
  background-color: rgba(63, 185, 80, 0.1);
  color: var(--theme-success);
  border-top: 1px solid var(--theme-success);
}

/* 模态框底部 */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
  flex-shrink: 0;
}

/* Select 样式 */
select.input {
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%238b949e' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 10px center;
  background-repeat: no-repeat;
  background-size: 16px;
  padding-right: 36px;
}

/* MCP 相关样式 */
.mcp-actions-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
  gap: 8px;
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
