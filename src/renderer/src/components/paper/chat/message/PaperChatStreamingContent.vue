<script setup lang="ts">
import { computed } from 'vue'
import styles from './PaperChatStreamingContent.module.css'

const props = defineProps<{
  hasToolActivity: boolean
  showStandaloneReasoning: boolean
  hasStructuredReact: boolean
}>()

/**
 * 等待态标题
 */
const waitingPlaceholderTitle = computed(() => {
  if (props.hasToolActivity) {
    return '正在整理工具结果'
  }

  if (props.showStandaloneReasoning || props.hasStructuredReact) {
    return '正在整理回复'
  }

  return '正在组织回复'
})

/**
 * 等待态说明
 */
const waitingPlaceholderSubtitle = computed(() => {
  if (props.hasToolActivity) {
    return '已拿到过程信息，正文即将开始输出'
  }

  if (props.showStandaloneReasoning || props.hasStructuredReact) {
    return '已展开分析，正在归纳首段内容'
  }

  return '模型已收到问题，正在整理回答'
})
</script>

<template>
  <div :class="styles['streaming-placeholder']" aria-live="polite">
    <div :class="styles['streaming-placeholder-head']">
      <div :class="styles['streaming-placeholder-pulse']" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div :class="styles['streaming-placeholder-copy']">
        <span :class="styles['streaming-placeholder-title']">{{ waitingPlaceholderTitle }}</span>
        <span :class="styles['streaming-placeholder-subtitle']">{{
          waitingPlaceholderSubtitle
        }}</span>
      </div>
    </div>
    <div :class="styles['streaming-placeholder-bars']" aria-hidden="true">
      <span :class="[styles['streaming-placeholder-bar'], 'primary']"></span>
      <span :class="[styles['streaming-placeholder-bar'], 'secondary']"></span>
    </div>
  </div>
</template>
