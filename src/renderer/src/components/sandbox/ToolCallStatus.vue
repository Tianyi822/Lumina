<script setup lang="ts">
import { ref, computed } from 'vue'

export type ToolStatus = 'pending' | 'running' | 'success' | 'error'

export interface ToolCallInfo {
  id: string
  name: string
  params: Record<string, unknown>
  status: ToolStatus
  result?: unknown
  error?: string
  startTime?: string
  endTime?: string
}

const props = defineProps<{
  toolCall: ToolCallInfo
}>()

const emit = defineEmits<{
  (e: 'toggle-expand'): void
}>()

const isExpanded = ref(false)

const statusIcon = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return '⏳'
    case 'running':
      return '▶️'
    case 'success':
      return '✓'
    case 'error':
      return '✗'
    default:
      return '•'
  }
})

const statusClass = computed(() => {
  return `status-${props.toolCall.status}`
})

const statusText = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return '等待执行'
    case 'running':
      return '执行中...'
    case 'success':
      return '执行成功'
    case 'error':
      return '执行失败'
    default:
      return '未知状态'
  }
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

function toggleExpand(): void {
  isExpanded.value = !isExpanded.value
  emit('toggle-expand')
}
</script>

<template>
  <div class="tool-call-status" :class="statusClass">
    <div class="tool-header" @click="toggleExpand">
      <span class="status-icon">{{ statusIcon }}</span>
      <span class="tool-name">{{ toolCall.name }}</span>
      <span class="status-text">{{ statusText }}</span>
      <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
    </div>

    <div v-if="isExpanded" class="tool-details">
      <div class="detail-section">
        <h4>参数</h4>
        <pre class="code-block">{{ formattedParams }}</pre>
      </div>

      <div v-if="toolCall.status === 'success' && toolCall.result" class="detail-section">
        <h4>结果</h4>
        <pre class="code-block success">{{ formattedResult }}</pre>
      </div>

      <div v-if="toolCall.status === 'error' && toolCall.error" class="detail-section">
        <h4>错误</h4>
        <pre class="code-block error">{{ toolCall.error }}</pre>
      </div>

      <div class="detail-section timestamps">
        <span v-if="toolCall.startTime"
          >开始: {{ new Date(toolCall.startTime).toLocaleTimeString() }}</span
        >
        <span v-if="toolCall.endTime"
          >结束: {{ new Date(toolCall.endTime).toLocaleTimeString() }}</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-call-status {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
  margin: 8px 0;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.tool-header:hover {
  background-color: var(--theme-bg-hover);
}

.status-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
}

.tool-name {
  font-family: monospace;
  font-size: 13px;
  color: var(--theme-accent);
  flex: 1;
}

.status-text {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.expand-icon {
  font-size: 10px;
  color: var(--theme-text-secondary);
}

/* 状态样式 */
.status-pending {
  border-left: 3px solid var(--theme-info);
}

.status-running {
  border-left: 3px solid var(--theme-warning);
}

.status-success {
  border-left: 3px solid var(--theme-success);
}

.status-error {
  border-left: 3px solid var(--theme-danger);
}

.tool-details {
  padding: 12px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
}

.detail-section {
  margin-bottom: 12px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h4 {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin: 0 0 6px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.code-block {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  padding: 8px 12px;
  font-family: monospace;
  font-size: 12px;
  color: var(--theme-text);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.code-block.success {
  border-color: var(--theme-success);
  background-color: rgba(63, 185, 80, 0.05);
}

.code-block.error {
  border-color: var(--theme-danger);
  background-color: rgba(248, 81, 73, 0.05);
  color: var(--theme-danger);
}

.timestamps {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: var(--theme-text-secondary);
}
</style>
