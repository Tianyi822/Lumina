<script setup lang="ts">
import { formatTokenCount } from '@renderer/utils/tokenEstimate'
import styles from './PaperChatTokenStats.module.css'

defineProps<{
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    reasoning_tokens?: number
  }
  userTokenLabel?: string
}>()

/**
 * 格式化 Token 统计
 */
function formatTokenUsage(usage: {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens?: number
}): string {
  let result = `输入: ${formatTokenCount(usage.prompt_tokens)} | 输出: ${formatTokenCount(usage.completion_tokens)} | 总计: ${formatTokenCount(usage.total_tokens)}`
  if (usage.reasoning_tokens) {
    result += ` | 思考: ${formatTokenCount(usage.reasoning_tokens)}`
  }
  return result
}
</script>

<template>
  <div v-if="userTokenLabel" :class="styles['token-usage']">
    {{ userTokenLabel }}
  </div>
  <div v-else-if="usage" :class="styles['token-usage']">
    {{ formatTokenUsage(usage) }}
  </div>
</template>
