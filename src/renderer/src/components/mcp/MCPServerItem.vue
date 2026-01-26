<script setup lang="ts">
import KeyValueEditor from './KeyValueEditor.vue'
import type { MCPServerConfig, MCPConnectionStatus, MCPTransportType } from '@renderer/types'

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
  (e: 'toggle-enabled', config: MCPServerConfig): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

/**
 * 更新配置
 */
function updateConfig(updates: Partial<MCPServerConfig>): void {
  emit('save', { ...props.config, ...updates })
}

/**
 * 更新传输类型
 */
function updateTransport(value: string): void {
  emit('save', { ...props.config, transport: value as MCPTransportType })
}

/**
 * 切换展开状态
 */
function handleToggle(): void {
  emit('toggle-expand', props.config.name)
}
</script>

<template>
  <div class="model-item">
    <div class="model-header" @click="handleToggle">
      <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
      <span class="model-name">{{ config.name }}</span>
      <!-- 连接状态指示器 -->
      <span
        class="status-indicator"
        :class="{
          connected: status?.connected,
          error: status?.error
        }"
        :title="status?.error || ''"
      >
        {{ status?.connected ? '已连接' : '未连接' }}
      </span>
      <span class="transport-badge">{{ config.transport }}</span>
      <div class="model-actions">
        <button
          v-if="!status?.connected"
          class="btn btn-small"
          :disabled="connecting"
          @click.stop="emit('connect', config.name)"
        >
          {{ connecting ? '连接中...' : '连接' }}
        </button>
        <button v-else class="btn btn-small" @click.stop="emit('disconnect', config.name)">
          断开
        </button>
        <button class="btn btn-small" :disabled="testing" @click.stop="emit('test', config)">
          {{ testing ? '测试中...' : '测试' }}
        </button>
        <button class="btn btn-small btn-danger-text" @click.stop="emit('delete', config.name)">
          删除
        </button>
      </div>
    </div>

    <!-- 展开的详情 -->
    <div v-if="expanded" class="model-details">
      <div class="form-group">
        <label>传输类型</label>
        <select
          :value="config.transport"
          class="input"
          @change="updateTransport(($event.target as HTMLSelectElement).value)"
        >
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
            :value="config.command"
            type="text"
            class="input"
            placeholder="例如: npx, node, python"
            @blur="updateConfig({ command: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="form-group">
          <label>命令参数 (每行一个)</label>
          <textarea
            :value="config.args?.join('\n') || ''"
            class="input textarea-small"
            placeholder="-y&#10;@modelcontextprotocol/server-xxx"
            @blur="
              updateConfig({
                args: ($event.target as HTMLTextAreaElement).value
                  .split('\n')
                  .filter((s) => s.trim())
              })
            "
          ></textarea>
        </div>
        <div class="form-group">
          <label>环境变量 (KEY=VALUE 格式，每行一个)</label>
          <KeyValueEditor
            :model-value="config.env || {}"
            placeholder="API_KEY=xxx"
            @update:model-value="updateConfig({ env: $event })"
          />
        </div>
      </template>

      <!-- HTTP/SSE 配置 -->
      <template v-else>
        <div class="form-group">
          <label>服务地址</label>
          <input
            :value="config.url"
            type="text"
            class="input"
            placeholder="https://example.com/mcp"
            @blur="updateConfig({ url: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="form-group">
          <label>认证头 (KEY=VALUE 格式，每行一个)</label>
          <KeyValueEditor
            :model-value="config.headers || {}"
            placeholder="Authorization=Bearer xxx"
            @update:model-value="updateConfig({ headers: $event })"
          />
        </div>
      </template>

      <!-- 启用状态 -->
      <div class="form-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            :checked="config.enabled"
            @change="emit('toggle-enabled', config)"
          />
          <span>启用此服务器</span>
        </label>
      </div>

      <!-- 工具列表 -->
      <div v-if="status?.connected" class="tools-section">
        <h4 class="tools-title">可用工具 ({{ status.tools.length || 0 }})</h4>
        <div class="tools-list">
          <div v-for="tool in status.tools" :key="tool.name" class="tool-item">
            <span class="tool-name">{{ tool.name }}</span>
            <span class="tool-desc">{{ tool.description }}</span>
          </div>
          <div v-if="!status.tools?.length" class="empty-tools">暂无可用工具</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
