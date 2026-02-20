<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ReActStep } from '@renderer/types'
import ToolCallPanel from './ToolCallPanel.vue'

const props = defineProps<{
  steps: ReActStep[]
  isStreaming?: boolean
}>()

// 是否展开
const isExpanded = ref(false)

// 当前展开的步骤索引（预留用于未来功能）
// const expandedStepIndex = ref<number | null>(null)

// 步骤数量
const stepsCount = computed(() => props.steps.length)

// 工具调用数量
const toolCallsCount = computed(() => {
  return props.steps.filter((s) => s.type === 'tool_call').length
})

// 成功和失败的工具调用
const toolStats = computed(() => {
  const toolResults = props.steps.filter((s) => s.type === 'tool_result')
  return {
    success: toolResults.filter((s) => s.toolResult?.success).length,
    failed: toolResults.filter((s) => !s.toolResult?.success).length
  }
})

// 将步骤转换为工具调用面板项目
const toolCallItems = computed(() => {
  const items: Array<{
    id: string
    name: string
    serverName?: string
    params: Record<string, unknown>
    status: 'pending' | 'running' | 'success' | 'error'
    result?: unknown
    error?: string
    startTime?: string
    endTime?: string
  }> = []

  // 用于跟踪待处理的工具调用
  const pendingCalls = new Map<string, { index: number; startTime?: string }>()

  props.steps.forEach((step, index) => {
    if (step.type === 'tool_call' && step.toolCall) {
      pendingCalls.set(step.toolCall.id, {
        index: items.length,
        startTime: step.timestamp
      })
      items.push({
        id: step.toolCall.id,
        name: step.toolCall.name,
        serverName: step.toolCall.serverName,
        params: step.toolCall.arguments || {},
        status: props.isStreaming && index === props.steps.length - 1 ? 'running' : 'pending',
        startTime: step.timestamp
      })
    } else if (step.type === 'tool_result' && step.toolResult) {
      const pending = pendingCalls.get(step.toolResult.id)
      if (pending) {
        const item = items[pending.index]
        if (item) {
          item.status = step.toolResult.success ? 'success' : 'error'
          item.result = step.toolResult.result
          item.error = step.toolResult.error
          item.endTime = step.timestamp
        }
        pendingCalls.delete(step.toolResult.id)
      }
    }
  })

  return items
})

// 切换展开状态
function toggleExpand(): void {
  isExpanded.value = !isExpanded.value
}

// 处理工具调用面板展开
function handleToolExpand(_toolId: string): void {
  // 可以在这里添加额外的逻辑，比如滚动到对应位置
}
</script>

<template>
  <div v-if="stepsCount > 0" class="react-steps-container">
    <!-- 折叠标题栏 -->
    <div class="react-header" @click="toggleExpand">
      <div class="header-left">
        <span class="react-icon">⚡</span>
        <span class="react-title">ReAct 推理</span>
        <span class="react-badge">{{ toolCallsCount }} 次工具调用</span>
        <span v-if="isStreaming" class="streaming-indicator">
          <span class="pulse-dot"></span>
          进行中...
        </span>
      </div>
      <div class="header-right">
        <span v-if="toolStats.success > 0" class="stat-badge success">
          ✓ {{ toolStats.success }}
        </span>
        <span v-if="toolStats.failed > 0" class="stat-badge error"> ✗ {{ toolStats.failed }} </span>
        <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
      </div>
    </div>

    <!-- 展开内容 -->
    <div v-if="isExpanded" class="react-content">
      <div class="timeline">
        <ToolCallPanel
          v-for="(item, index) in toolCallItems"
          :key="item.id"
          :tool-call="item"
          :index="index"
          @toggle-expand="handleToolExpand"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.react-steps-container {
  margin: var(--theme-spacing) 0;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background-color: var(--theme-bg-secondary);
  overflow: hidden;
  transition: all 0.2s ease;
}

.react-steps-container:hover {
  border-color: var(--theme-border-hover);
}

/* 头部样式 */
.react-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--theme-spacing-sm);
  padding: var(--theme-spacing-sm) var(--theme-spacing);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.react-header:hover {
  background-color: var(--theme-bg-hover);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.react-icon {
  font-size: 14px;
}

.react-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
}

.react-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  background-color: var(--theme-accent);
  color: var(--theme-bg);
  border-radius: 10px;
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--theme-accent);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background-color: var(--theme-accent);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 10px;
}

.stat-badge.success {
  background-color: rgba(16, 185, 129, 0.2);
  color: var(--theme-success);
}

.stat-badge.error {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--theme-danger);
}

.expand-icon {
  font-size: 10px;
  color: var(--theme-text-secondary);
  transition: transform 0.2s ease;
}

.react-steps-container:has(.react-content[style*='display: block']) .expand-icon,
.react-content:not([style*='display: none']) + .react-header .expand-icon {
  transform: rotate(180deg);
}

/* 内容区域 */
.react-content {
  border-top: 1px solid var(--theme-border);
  max-height: 600px;
  overflow-y: auto;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 600px;
  }
}

/* 时间线 */
.timeline {
  padding: var(--theme-spacing);
  position: relative;
}

.timeline::before {
  content: '';
  position: absolute;
  left: calc(var(--theme-spacing) + 11px);
  top: var(--theme-spacing);
  bottom: var(--theme-spacing);
  width: 2px;
  background: linear-gradient(
    to bottom,
    var(--theme-border),
    var(--theme-border-hover),
    var(--theme-border)
  );
  opacity: 0.5;
}

/* 自定义滚动条 */
.react-content::-webkit-scrollbar {
  width: 6px;
}

.react-content::-webkit-scrollbar-track {
  background: var(--theme-bg-tertiary);
  border-radius: 3px;
}

.react-content::-webkit-scrollbar-thumb {
  background: var(--theme-border-hover);
  border-radius: 3px;
}

.react-content::-webkit-scrollbar-thumb:hover {
  background: var(--theme-text-secondary);
}
</style>
