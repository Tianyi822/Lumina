<script setup lang="ts">
import KeyValueEditor from './KeyValueEditor.vue'
import type { MCPServerConfig, MCPConnectionStatus } from '@renderer/types'

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
          @change="emit('save', { ...config, transport: $event.target.value })"
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
            @blur="emit('save', { ...config, command: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="form-group">
          <label>命令参数 (每行一个)</label>
          <textarea
            :value="config.args?.join('\n') || ''"
            class="input textarea-small"
            placeholder="-y&#10;@modelcontextprotocol/server-xxx"
            @blur="
              emit('save', {
                ...config,
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
            @update:model-value="emit('save', { ...config, env: $event })"
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
            @blur="emit('save', { ...config, url: ($event.target as HTMLInputElement).value })"
          />
        </div>
        <div class="form-group">
          <label>认证头 (KEY=VALUE 格式，每行一个)</label>
          <KeyValueEditor
            :model-value="config.headers || {}"
            placeholder="Authorization=Bearer xxx"
            @update:model-value="emit('save', { ...config, headers: $event })"
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
