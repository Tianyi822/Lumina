<script setup lang="ts">
import { ref, watch } from 'vue'
import KeyValueEditor from './KeyValueEditor.vue'
import type { MCPServerConfig, MCPConnectionStatus, MCPTransportType } from '@renderer/types'
import styles from './MCPServerItem.module.css'

interface Props {
  config: MCPServerConfig
  status?: MCPConnectionStatus
  expanded: boolean
  connecting: boolean
  testing: boolean
}

interface Emits {
  (e: 'toggle-expand', name: string): void
  (e: 'connect', name: string): void
  (e: 'disconnect', name: string): void
  (e: 'delete', name: string): void
  (e: 'test', config: MCPServerConfig): void
  (e: 'save', config: MCPServerConfig): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const localConfig = ref<MCPServerConfig>({
  name: '',
  transport: 'stdio',
  command: '',
  args: [],
  env: {},
  url: '',
  headers: {}
})
const argsText = ref('')
const warningMessage = ref('')

function syncLocalConfig(config: MCPServerConfig): void {
  localConfig.value = {
    ...config,
    command: config.command || '',
    args: [...(config.args || [])],
    env: { ...(config.env || {}) },
    url: config.url || '',
    headers: { ...(config.headers || {}) }
  }
  argsText.value = (config.args || []).join('\n')
}

function buildConfigToSave(): MCPServerConfig {
  const isStdioTransport = localConfig.value.transport === 'stdio'

  return {
    ...localConfig.value,
    name: localConfig.value.name.trim(),
    command: isStdioTransport ? localConfig.value.command?.trim() || '' : '',
    args: isStdioTransport
      ? argsText.value
          .split('\n')
          .map((item) => item.trim())
          .filter((item) => item)
      : [],
    env: isStdioTransport ? { ...(localConfig.value.env || {}) } : {},
    url: isStdioTransport ? '' : localConfig.value.url?.trim() || '',
    headers: isStdioTransport ? {} : { ...(localConfig.value.headers || {}) }
  }
}

function validateConfig(config: MCPServerConfig): string {
  if (!config.name) {
    return '服务器名称不能为空'
  }

  if (config.transport === 'stdio') {
    if (!config.command) {
      return `MCP 服务“${config.name}”的执行命令不能为空`
    }
  } else if (!config.url) {
    return `MCP 服务“${config.name}”的服务地址不能为空`
  }

  return ''
}

async function persistConfig(): Promise<void> {
  const config = buildConfigToSave()
  const validationMessage = validateConfig(config)
  if (validationMessage) {
    warningMessage.value = validationMessage
    return
  }

  warningMessage.value = ''
  emit('save', config)
}

/**
 * 更新配置
 */
function updateConfig(updates: Partial<MCPServerConfig>): void {
  localConfig.value = {
    ...localConfig.value,
    ...updates
  }
}

/**
 * 更新传输类型
 */
function updateTransport(value: string): void {
  const transport = value as MCPTransportType
  if (transport === 'stdio') {
    updateConfig({
      transport,
      url: '',
      headers: {}
    })
  } else if (localConfig.value.transport === 'stdio') {
    updateConfig({
      transport,
      command: '',
      args: [],
      env: {},
      url: localConfig.value.url || '',
      headers: localConfig.value.headers || {}
    })
    argsText.value = ''
  } else {
    updateConfig({
      transport
    })
  }

  warningMessage.value = ''
}

/**
 * 切换展开状态
 */
function handleToggle(): void {
  emit('toggle-expand', props.config.name)
}

function handleArgsBlur(): void {
  localConfig.value.args = argsText.value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item)
  void persistConfig()
}

function handleEnvChange(value: Record<string, string>): void {
  updateConfig({ env: value || {} })
  void persistConfig()
}

function handleHeadersChange(value: Record<string, string>): void {
  updateConfig({ headers: value || {} })
  void persistConfig()
}

function handleTest(): void {
  const config = buildConfigToSave()
  const validationMessage = validateConfig(config)
  if (validationMessage) {
    warningMessage.value = validationMessage
    return
  }

  warningMessage.value = ''
  emit('test', config)
}

watch(
  () => props.config,
  (config) => {
    syncLocalConfig(config)
  },
  { deep: true, immediate: true }
)
</script>

<template>
  <div :class="styles['mcp-server-item']">
    <div :class="styles['mcp-server-header']" @click="handleToggle">
      <span :class="styles['expand-icon']">{{ expanded ? '▼' : '▶' }}</span>
      <span :class="styles['mcp-server-name']">{{ config.name }}</span>
      <!-- 连接状态指示器 -->
      <span
        :class="[
          styles['status-indicator'],
          {
            [styles.connected]: status?.connected,
            [styles.error]: status?.error
          }
        ]"
        :title="status?.error || ''"
      >
        {{ status?.connected ? '已连接' : '未连接' }}
      </span>
      <span :class="styles['transport-badge']">{{ localConfig.transport }}</span>
      <div :class="styles['mcp-server-actions']">
        <button
          v-if="!status?.connected"
          class="sm-button sm-button--small"
          :disabled="connecting"
          @click.stop="emit('connect', config.name)"
        >
          {{ connecting ? '连接中...' : '连接' }}
        </button>
        <button
          v-else
          class="sm-button sm-button--small"
          @click.stop="emit('disconnect', config.name)"
        >
          断开
        </button>
        <button class="sm-button sm-button--small" :disabled="testing" @click.stop="handleTest">
          {{ testing ? '测试中...' : '测试' }}
        </button>
        <button
          :class="['sm-button', 'sm-button--small', 'sm-button--danger', styles['btn-danger-text']]"
          @click.stop="emit('delete', config.name)"
        >
          删除
        </button>
      </div>
    </div>

    <!-- 展开的详情 -->
    <div v-if="expanded" :class="styles['mcp-server-details']">
      <div :class="styles['form-group']">
        <label>传输类型</label>
        <select
          :value="localConfig.transport"
          class="sm-select"
          @change="updateTransport(($event.target as HTMLSelectElement).value)"
        >
          <option value="stdio">stdio (本地进程)</option>
          <option value="sse">SSE (Server-Sent Events)</option>
          <option value="streamableHttp">Streamable HTTP</option>
        </select>
      </div>

      <!-- stdio 配置 -->
      <template v-if="localConfig.transport === 'stdio'">
        <div :class="styles['form-group']">
          <label>执行命令</label>
          <input
            v-model="localConfig.command"
            type="text"
            class="sm-input"
            placeholder="例如: npx, node, python"
            @blur="persistConfig"
          />
        </div>
        <div :class="styles['form-group']">
          <label>命令参数 (每行一个)</label>
          <textarea
            v-model="argsText"
            :class="['sm-textarea', styles['textarea-small']]"
            placeholder="-y&#10;@modelcontextprotocol/server-xxx"
            @blur="handleArgsBlur"
          ></textarea>
        </div>
        <div :class="styles['form-group']">
          <label>环境变量 (KEY=VALUE 格式，每行一个)</label>
          <KeyValueEditor
            :model-value="localConfig.env || {}"
            placeholder="API_KEY=xxx"
            @update:model-value="handleEnvChange"
          />
        </div>
      </template>

      <!-- HTTP/SSE 配置 -->
      <template v-else>
        <div :class="styles['form-group']">
          <label>服务地址</label>
          <input
            v-model="localConfig.url"
            type="text"
            class="sm-input"
            placeholder="https://example.com/mcp"
            @blur="persistConfig"
          />
        </div>
        <div :class="styles['form-group']">
          <label>认证头 (KEY=VALUE 格式，每行一个)</label>
          <KeyValueEditor
            :model-value="localConfig.headers || {}"
            placeholder="Authorization=Bearer xxx"
            @update:model-value="handleHeadersChange"
          />
        </div>
      </template>

      <div v-if="warningMessage" :class="styles['inline-warning']">
        {{ warningMessage }}
      </div>

      <!-- 工具列表 -->
      <div v-if="status?.connected" :class="styles['tools-section']">
        <h4 :class="styles['tools-title']">可用工具 ({{ status.tools.length || 0 }})</h4>
        <div :class="styles['tools-list']">
          <div v-for="tool in status.tools" :key="tool.name" :class="styles['tool-item']">
            <span :class="styles['tool-name']">{{ tool.name }}</span>
            <span :class="styles['tool-desc']">{{ tool.description }}</span>
          </div>
          <div v-if="!status.tools?.length" :class="styles['empty-tools']">暂无可用工具</div>
        </div>
      </div>
    </div>
  </div>
</template>
