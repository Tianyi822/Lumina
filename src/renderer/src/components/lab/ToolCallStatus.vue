<script setup lang="ts">
import { ref, computed } from 'vue'
import styles from './ToolCallStatus.module.css'

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
  <div :class="[styles['tool-call-status'], styles[statusClass]]">
    <div :class="styles['tool-header']" @click="toggleExpand">
      <span :class="styles['status-icon']">{{ statusIcon }}</span>
      <span :class="styles['tool-name']">{{ toolCall.name }}</span>
      <span :class="styles['status-text']">{{ statusText }}</span>
      <span :class="styles['expand-icon']">{{ isExpanded ? '▼' : '▶' }}</span>
    </div>

    <div v-if="isExpanded" :class="styles['tool-details']">
      <div :class="styles['detail-section']">
        <h4>参数</h4>
        <pre :class="styles['code-block']">{{ formattedParams }}</pre>
      </div>

      <div
        v-if="toolCall.status === 'success' && toolCall.result"
        :class="styles['detail-section']"
      >
        <h4>结果</h4>
        <pre :class="[styles['code-block'], styles['success']]">{{ formattedResult }}</pre>
      </div>

      <div v-if="toolCall.status === 'error' && toolCall.error" :class="styles['detail-section']">
        <h4>错误</h4>
        <pre :class="[styles['code-block'], styles['error']]">{{ toolCall.error }}</pre>
      </div>

      <div :class="[styles['detail-section'], styles['timestamps']]">
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
