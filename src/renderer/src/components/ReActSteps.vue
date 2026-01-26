<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ReActStep } from '@renderer/types'

const props = defineProps<{
  steps: ReActStep[]
  isStreaming?: boolean
}>()

// 是否展开
const isExpanded = ref(false)

// 步骤数量
const stepsCount = computed(() => props.steps.length)

// 工具调用数量
const toolCallsCount = computed(() => {
  return props.steps.filter((s) => s.type === 'tool_call').length
})

// 格式化 JSON
function formatJson(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

// 切换展开状态
function toggleExpand(): void {
  isExpanded.value = !isExpanded.value
}

// 获取步骤图标
function getStepIcon(step: ReActStep): string {
  if (step.type === 'tool_call') {
    return '🔧'
  } else if (step.type === 'tool_result') {
    return step.toolResult?.success ? '✅' : '❌'
  }
  return '📋'
}

// 获取步骤标题
function getStepTitle(step: ReActStep): string {
  if (step.type === 'tool_call' && step.toolCall) {
    return `调用 ${step.toolCall.serverName}/${step.toolCall.name}`
  } else if (step.type === 'tool_result' && step.toolResult) {
    return step.toolResult.success
      ? `${step.toolResult.name} 执行成功`
      : `${step.toolResult.name} 执行失败`
  }
  return '未知步骤'
}
</script>

<template>
  <div v-if="stepsCount > 0" class="react-steps-container">
    <!-- 折叠标题栏 -->
    <div class="react-header" @click="toggleExpand">
      <span class="react-icon">⚡</span>
      <span class="react-title">
        ReAct 推理
        <span class="react-badge">{{ toolCallsCount }} 次工具调用</span>
        <span v-if="isStreaming" class="streaming-indicator">进行中...</span>
      </span>
      <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
    </div>

    <!-- 展开内容 -->
    <div v-if="isExpanded" class="react-content">
      <div v-for="(step, index) in steps" :key="index" class="react-step">
        <div class="step-header">
          <span class="step-icon">{{ getStepIcon(step) }}</span>
          <span class="step-title">{{ getStepTitle(step) }}</span>
          <span class="step-index">#{{ index + 1 }}</span>
        </div>

        <!-- 工具调用详情 -->
        <div v-if="step.type === 'tool_call' && step.toolCall" class="step-details">
          <div class="detail-label">参数:</div>
          <pre class="detail-code">{{ formatJson(step.toolCall.arguments) }}</pre>
        </div>

        <!-- 工具结果详情 -->
        <div v-if="step.type === 'tool_result' && step.toolResult" class="step-details">
          <div v-if="step.toolResult.success" class="detail-section">
            <div class="detail-label">结果:</div>
            <pre class="detail-code result-success">{{ formatJson(step.toolResult.result) }}</pre>
          </div>
          <div v-else class="detail-section">
            <div class="detail-label">错误:</div>
            <pre class="detail-code result-error">{{ step.toolResult.error }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.react-steps-container {
  margin: 12px 0;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background-color: var(--theme-bg-secondary);
  overflow: hidden;
}

.react-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.react-header:hover {
  background-color: var(--theme-bg-hover);
}

.react-icon {
  font-size: 14px;
}

.react-title {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

.react-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: normal;
  background-color: var(--theme-accent);
  color: var(--theme-bg);
  border-radius: 10px;
}

.streaming-indicator {
  margin-left: 8px;
  font-size: 11px;
  font-weight: normal;
  color: var(--theme-accent);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.expand-icon {
  font-size: 10px;
  color: var(--theme-text-secondary);
}

.react-content {
  border-top: 1px solid var(--theme-border);
  max-height: 400px;
  overflow-y: auto;
}

.react-step {
  padding: 12px 14px;
  border-bottom: 1px solid var(--theme-border);
}

.react-step:last-child {
  border-bottom: none;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.step-icon {
  font-size: 14px;
}

.step-title {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
}

.step-index {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.step-details {
  margin-top: 8px;
}

.detail-section {
  margin-bottom: 8px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-size: 11px;
  color: var(--theme-text-secondary);
  margin-bottom: 4px;
}

.detail-code {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  padding: 8px 12px;
  background-color: var(--theme-bg);
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
}

.result-success {
  border-left: 3px solid var(--theme-accent);
}

.result-error {
  border-left: 3px solid var(--theme-danger, #f85149);
  color: var(--theme-danger, #f85149);
}
</style>
