<script setup lang="ts">
import { ref, computed } from 'vue'
import styles from './PaperChatToolCallPanel.module.css'
// PaperChatToolCallPanel - 工具调用卡片组件

export type ToolStatus = 'pending' | 'running' | 'success' | 'error'

export interface PaperChatToolCallPanelItem {
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
  toolCall: PaperChatToolCallPanelItem
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
        class: 'paper-chat-tool-call--pending',
        color: 'var(--sm-color-status-info)'
      }
    case 'running':
      return {
        icon: '…',
        text: '执行中',
        class: 'paper-chat-tool-call--running',
        color: 'var(--sm-color-status-warning)'
      }
    case 'success':
      return {
        icon: '✓',
        text: '执行成功',
        class: 'paper-chat-tool-call--success',
        color: 'var(--sm-color-status-success)'
      }
    case 'error':
      return {
        icon: '!',
        text: '执行失败',
        class: 'paper-chat-tool-call--error',
        color: 'var(--sm-color-status-danger)'
      }
    default:
      return {
        icon: '•',
        text: '未知状态',
        class: 'paper-chat-tool-call--unknown',
        color: 'var(--sm-color-text-secondary)'
      }
  }
})

const displayName = computed(() => {
  if (props.toolCall.serverName && props.toolCall.serverName !== 'lab') {
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
  <div class="paper-chat-tool-call" :class="[statusConfig.class, { expanded: isExpanded }]">
    <!-- 卡片头部 -->
    <button
      type="button"
      :class="styles['paper-chat-tool-call__header']"
      :aria-expanded="isExpanded"
      @click="toggleExpand"
    >
      <div :class="styles['paper-chat-tool-call__header-left']">
        <span v-if="index !== undefined" :class="styles['paper-chat-tool-call__step-number']"
          >#{{ index + 1 }}</span
        >
        <span
          :class="styles['paper-chat-tool-call__status-icon']"
          :style="{ color: statusConfig.color }"
        >
          {{ statusConfig.icon }}
        </span>
        <span :class="styles['paper-chat-tool-call__tool-name']">{{ displayName }}</span>
      </div>
      <div :class="styles['paper-chat-tool-call__header-right']">
        <span
          :class="styles['paper-chat-tool-call__status-text']"
          :style="{ color: statusConfig.color }"
        >
          {{ statusConfig.text }}
        </span>
        <span v-if="executionTime" :class="styles['paper-chat-tool-call__execution-time']">{{
          executionTime
        }}</span>
        <span :class="styles['paper-chat-tool-call__expand-icon']">{{
          isExpanded ? '▼' : '▶'
        }}</span>
      </div>
    </button>

    <!-- 卡片内容 -->
    <div v-if="isExpanded" :class="styles['paper-chat-tool-call__content']">
      <!-- 参数部分 -->
      <div :class="styles['paper-chat-tool-call__section']">
        <div :class="styles['paper-chat-tool-call__section-header']">
          <span :class="styles['paper-chat-tool-call__section-title']">参数</span>
        </div>
        <pre
          :class="[styles['paper-chat-tool-call__code'], styles['paper-chat-tool-call__params']]"
          >{{ formattedParams }}</pre
        >
      </div>

      <!-- 结果部分 -->
      <div
        v-if="toolCall.status === 'success' && toolCall.result"
        :class="styles['paper-chat-tool-call__section']"
      >
        <div :class="styles['paper-chat-tool-call__section-header']">
          <span :class="styles['paper-chat-tool-call__section-title']">执行结果</span>
        </div>
        <pre
          :class="[
            styles['paper-chat-tool-call__code'],
            styles['paper-chat-tool-call__result'],
            'success'
          ]"
          >{{ formattedResult }}</pre
        >
      </div>

      <!-- 错误部分 -->
      <div
        v-if="toolCall.status === 'error' && toolCall.error"
        :class="styles['paper-chat-tool-call__section']"
      >
        <div :class="styles['paper-chat-tool-call__section-header']">
          <span :class="styles['paper-chat-tool-call__section-title']">错误信息</span>
        </div>
        <pre
          :class="[
            styles['paper-chat-tool-call__code'],
            styles['paper-chat-tool-call__result'],
            'error'
          ]"
          >{{ toolCall.error }}</pre
        >
      </div>

      <!-- 时间戳 -->
      <div
        v-if="toolCall.startTime || toolCall.endTime"
        :class="styles['paper-chat-tool-call__timestamps']"
      >
        <span v-if="toolCall.startTime" :class="styles['paper-chat-tool-call__timestamp']">
          <span :class="styles['paper-chat-tool-call__timestamp-label']">开始:</span>
          {{ new Date(toolCall.startTime).toLocaleTimeString() }}
        </span>
        <span v-if="toolCall.endTime" :class="styles['paper-chat-tool-call__timestamp']">
          <span :class="styles['paper-chat-tool-call__timestamp-label']">结束:</span>
          {{ new Date(toolCall.endTime).toLocaleTimeString() }}
        </span>
      </div>
    </div>
  </div>
</template>
