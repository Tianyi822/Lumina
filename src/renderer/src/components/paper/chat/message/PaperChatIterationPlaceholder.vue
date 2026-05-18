<script setup lang="ts">
import { computed } from 'vue'
import type { UiReactIterationStatus } from '@renderer/types'
import styles from './PaperChatIterationPlaceholder.module.css'

const props = defineProps<{
  iteration: number
  status?: UiReactIterationStatus
}>()

/**
 * 迭代标题
 */
const title = computed(() => `第 ${props.iteration + 1} 轮推理中...`)

/**
 * 状态文本
 */
const statusText = computed(() => {
  switch (props.status) {
    case 'calling_tools':
      return '正在调用工具...'
    case 'processing':
      return '正在处理结果...'
    default:
      return '正在思考...'
  }
})

/**
 * 状态说明
 */
const statusSubtitle = computed(() => {
  switch (props.status) {
    case 'calling_tools':
      return '正在执行工具调用，获取实时信息'
    case 'processing':
      return '工具调用完成，正在整合结果'
    default:
      return '模型正在分析问题，规划解决方案'
  }
})
</script>

<template>
  <div :class="styles['iteration-placeholder']" aria-live="polite">
    <div :class="styles['iteration-placeholder-head']">
      <div :class="styles['iteration-placeholder-pulse']" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div :class="styles['iteration-placeholder-copy']">
        <span :class="styles['iteration-placeholder-title']">{{ title }}</span>
        <span :class="styles['iteration-placeholder-status']">{{ statusText }}</span>
        <span :class="styles['iteration-placeholder-subtitle']">{{ statusSubtitle }}</span>
      </div>
    </div>
    <div :class="styles['iteration-placeholder-bars']" aria-hidden="true">
      <span :class="[styles['iteration-placeholder-bar'], 'primary']"></span>
      <span :class="[styles['iteration-placeholder-bar'], 'secondary']"></span>
    </div>
  </div>
</template>
