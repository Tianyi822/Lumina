<script setup lang="ts">
import { computed } from 'vue'

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

  return '正在思考中'
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

  return '模型已收到问题，正在准备首段回复'
})
</script>

<template>
  <div class="streaming-placeholder" aria-live="polite">
    <div class="streaming-placeholder-head">
      <div class="streaming-placeholder-pulse" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="streaming-placeholder-copy">
        <span class="streaming-placeholder-title">{{ waitingPlaceholderTitle }}</span>
        <span class="streaming-placeholder-subtitle">{{ waitingPlaceholderSubtitle }}</span>
      </div>
    </div>
    <div class="streaming-placeholder-bars" aria-hidden="true">
      <span class="streaming-placeholder-bar primary"></span>
      <span class="streaming-placeholder-bar secondary"></span>
    </div>
  </div>
</template>

<style scoped>
.streaming-placeholder {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: min(280px, 68vw);
  padding: 12px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
}

.streaming-placeholder-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.streaming-placeholder-pulse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: rgba(142, 149, 217, 0.08);
  border: 1px solid rgba(142, 149, 217, 0.18);
}

.streaming-placeholder-pulse span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--sm-color-accent-hover);
  opacity: 0.35;
  animation: placeholderDotPulse 1.4s ease-in-out infinite;
}

.streaming-placeholder-pulse span:nth-child(2) {
  animation-delay: 0.16s;
}

.streaming-placeholder-pulse span:nth-child(3) {
  animation-delay: 0.32s;
}

.streaming-placeholder-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.streaming-placeholder-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  line-height: 1.2;
}

.streaming-placeholder-subtitle {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  line-height: 1.4;
}

.streaming-placeholder-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.streaming-placeholder-bar {
  display: block;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.streaming-placeholder-bar.primary {
  width: min(188px, 100%);
}

.streaming-placeholder-bar.secondary {
  width: min(132px, 72%);
  opacity: 0.72;
}

@keyframes placeholderDotPulse {
  0%,
  80%,
  100% {
    opacity: 0.35;
  }
  40% {
    opacity: 1;
  }
}
</style>
