<script setup lang="ts">
import { ref, computed } from 'vue'
// ToolCallPanel - 工具调用卡片组件

export type ToolStatus = 'pending' | 'running' | 'success' | 'error'

export interface ToolCallPanelItem {
  id: string
  name: string
  serverName?: string
  params: Record<string, unknown>
  status: ToolStatus
  result?: unknown
  error?: string
  startTime?: string
  endTime?: string
}

const props = defineProps<{
  toolCall: ToolCallPanelItem
  index?: number
}>()

const emit = defineEmits<{
  (e: 'toggle-expand', id: string): void
}>()

const isExpanded = ref(false)

const statusConfig = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return {
        icon: '·',
        text: '等待执行',
        class: 'status-pending',
        color: 'var(--theme-info)'
      }
    case 'running':
      return {
        icon: '…',
        text: '执行中',
        class: 'status-running',
        color: 'var(--theme-warning)'
      }
    case 'success':
      return {
        icon: '✓',
        text: '执行成功',
        class: 'status-success',
        color: 'var(--theme-success)'
      }
    case 'error':
      return {
        icon: '!',
        text: '执行失败',
        class: 'status-error',
        color: 'var(--theme-danger)'
      }
    default:
      return {
        icon: '•',
        text: '未知状态',
        class: 'status-unknown',
        color: 'var(--theme-text-secondary)'
      }
  }
})

const displayName = computed(() => {
  if (props.toolCall.serverName && props.toolCall.serverName !== 'sandbox') {
    return `${props.toolCall.serverName}/${props.toolCall.name}`
  }
  return props.toolCall.name
})

const formattedParams = computed(() => {
  try {
    return JSON.stringify(props.toolCall.params, null, 2)
  } catch {
    return String(props.toolCall.params)
  }
})

const formattedResult = computed(() => {
  if (!props.toolCall.result) return ''
  try {
    return JSON.stringify(props.toolCall.result, null, 2)
  } catch {
    return String(props.toolCall.result)
  }
})

const executionTime = computed(() => {
  if (!props.toolCall.startTime || !props.toolCall.endTime) return null
  const start = new Date(props.toolCall.startTime).getTime()
  const end = new Date(props.toolCall.endTime).getTime()
  const diff = end - start
  if (diff < 1000) return `${diff}ms`
  return `${(diff / 1000).toFixed(2)}s`
})

function toggleExpand(): void {
  isExpanded.value = !isExpanded.value
  emit('toggle-expand', props.toolCall.id)
}
</script>

<template>
  <div class="tool-call-panel" :class="[statusConfig.class, { expanded: isExpanded }]">
    <!-- 卡片头部 -->
    <button type="button" class="tool-header" :aria-expanded="isExpanded" @click="toggleExpand">
      <div class="header-left">
        <span v-if="index !== undefined" class="step-number">#{{ index + 1 }}</span>
        <span class="status-icon" :style="{ color: statusConfig.color }">
          {{ statusConfig.icon }}
        </span>
        <span class="tool-name">{{ displayName }}</span>
      </div>
      <div class="header-right">
        <span class="status-text" :style="{ color: statusConfig.color }">
          {{ statusConfig.text }}
        </span>
        <span v-if="executionTime" class="execution-time">{{ executionTime }}</span>
        <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
      </div>
    </button>

    <!-- 卡片内容 -->
    <div v-if="isExpanded" class="tool-content">
      <!-- 参数部分 -->
      <div class="content-section">
        <div class="section-header">
          <span class="section-title">参数</span>
        </div>
        <pre class="code-block params-block">{{ formattedParams }}</pre>
      </div>

      <!-- 结果部分 -->
      <div v-if="toolCall.status === 'success' && toolCall.result" class="content-section">
        <div class="section-header">
          <span class="section-title">执行结果</span>
        </div>
        <pre class="code-block result-block success">{{ formattedResult }}</pre>
      </div>

      <!-- 错误部分 -->
      <div v-if="toolCall.status === 'error' && toolCall.error" class="content-section">
        <div class="section-header">
          <span class="section-title">错误信息</span>
        </div>
        <pre class="code-block result-block error">{{ toolCall.error }}</pre>
      </div>

      <!-- 时间戳 -->
      <div v-if="toolCall.startTime || toolCall.endTime" class="timestamps">
        <span v-if="toolCall.startTime" class="timestamp">
          <span class="timestamp-label">开始:</span>
          {{ new Date(toolCall.startTime).toLocaleTimeString() }}
        </span>
        <span v-if="toolCall.endTime" class="timestamp">
          <span class="timestamp-label">结束:</span>
          {{ new Date(toolCall.endTime).toLocaleTimeString() }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-call-panel {
  position: relative;
  padding-left: 3px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  overflow: hidden;
  margin: var(--sm-space-2) 0;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.tool-call-panel:hover {
  background: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-strong);
}

.tool-call-panel::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--sm-color-text-tertiary);
}

.tool-call-panel.status-pending::before {
  background-color: var(--theme-info);
}

.tool-call-panel.status-running::before {
  background-color: var(--theme-warning);
}

.tool-call-panel.status-success::before {
  background-color: var(--theme-success);
}

.tool-call-panel.status-error::before {
  background-color: var(--theme-danger);
}

.tool-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-2);
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color var(--sm-transition-fast);
}

.tool-header:hover {
  background: var(--sm-color-surface-hover);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex: 1;
  min-width: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.step-number {
  font-family: var(--sm-font-mono);
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
  padding: 2px 6px;
  border-radius: var(--sm-radius-sm);
}

.status-icon {
  font-size: 13px;
  font-weight: 700;
  width: 20px;
  text-align: center;
}

.tool-name {
  font-family: var(--sm-font-mono);
  font-size: 13px;
  color: var(--sm-color-text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-text {
  font-size: 12px;
  font-weight: 500;
}

.execution-time {
  font-family: var(--sm-font-mono);
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
  padding: 2px 6px;
  border-radius: var(--sm-radius-sm);
}

.expand-icon {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
}

.tool-call-panel.expanded .expand-icon {
  transform: rotate(90deg);
}

.tool-content {
  padding: 12px;
  border-top: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
  animation: slideDown 160ms ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.content-section {
  margin-bottom: var(--sm-space-3);
}

.content-section:last-child {
  margin-bottom: 0;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--sm-color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.code-block {
  font-family: var(--sm-font-mono);
  font-size: 12px;
  line-height: 1.5;
  padding: 10px 12px;
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-sm);
  color: var(--sm-color-text-secondary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
}

.code-block::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.code-block::-webkit-scrollbar-track {
  background: transparent;
}

.code-block::-webkit-scrollbar-thumb {
  background: var(--sm-color-border-default);
  border-radius: 999px;
}

.params-block {
  border-left: 3px solid var(--theme-info);
}

.result-block.success {
  border-left: 3px solid var(--theme-success);
  background: rgba(127, 176, 138, 0.08);
}

.result-block.error {
  border-left: 3px solid var(--theme-danger);
  background: rgba(199, 120, 120, 0.08);
  color: var(--theme-danger);
}

.timestamps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-3);
  margin-top: var(--sm-space-3);
  padding-top: var(--sm-space-3);
  border-top: 1px solid var(--sm-color-border-subtle);
}

.timestamp {
  font-family: var(--sm-font-mono);
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
}

.timestamp-label {
  color: var(--sm-color-text-tertiary);
  margin-right: 4px;
  opacity: 0.7;
}
</style>
