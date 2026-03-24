<script setup lang="ts">
import { computed } from 'vue'
import type { ReactIterationStatus } from '@renderer/types'

const props = defineProps<{
  iteration: number
  status?: ReactIterationStatus
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
  <div class="iteration-placeholder" aria-live="polite">
    <div class="iteration-placeholder-head">
      <div class="iteration-placeholder-pulse" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="iteration-placeholder-copy">
        <span class="iteration-placeholder-title">{{ title }}</span>
        <span class="iteration-placeholder-status">{{ statusText }}</span>
        <span class="iteration-placeholder-subtitle">{{ statusSubtitle }}</span>
      </div>
    </div>
    <div class="iteration-placeholder-bars" aria-hidden="true">
      <span class="iteration-placeholder-bar primary"></span>
      <span class="iteration-placeholder-bar secondary"></span>
    </div>
  </div>
</template>

<style scoped>
.iteration-placeholder {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  background: linear-gradient(
    180deg,
    var(--glass-white-02, rgba(255, 255, 255, 0.02)) 0%,
    var(--glass-white-01, rgba(255, 255, 255, 0.01)) 100%
  );
}

.iteration-placeholder-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.iteration-placeholder-pulse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: radial-gradient(
      circle at top,
      rgba(99, 102, 241, 0.22),
      transparent 55%
    ),
    linear-gradient(135deg, rgba(99, 102, 241, 0.22), rgba(99, 102, 241, 0.08));
  border: 1px solid rgba(99, 102, 241, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 10px 24px rgba(99, 102, 241, 0.08);
}

.iteration-placeholder-pulse span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--theme-accent-secondary, #6366f1) 72%, white);
  opacity: 0.35;
  animation: placeholderDotPulse 1.2s ease-in-out infinite;
}

.iteration-placeholder-pulse span:nth-child(2) {
  animation-delay: 0.16s;
}

.iteration-placeholder-pulse span:nth-child(3) {
  animation-delay: 0.32s;
}

.iteration-placeholder-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.iteration-placeholder-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
  line-height: 1.2;
}

.iteration-placeholder-status {
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-accent-secondary, #6366f1);
  line-height: 1.4;
}

.iteration-placeholder-subtitle {
  font-size: 11px;
  color: var(--theme-text-tertiary);
  line-height: 1.4;
}

.iteration-placeholder-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.iteration-placeholder-bar {
  display: block;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(99, 102, 241, 0.12) 0%,
    rgba(99, 102, 241, 0.26) 48%,
    rgba(99, 102, 241, 0.12) 100%
  );
  background-size: 220% 100%;
  animation: placeholderShimmer 1.8s linear infinite;
}

.iteration-placeholder-bar.primary {
  width: min(188px, 100%);
}

.iteration-placeholder-bar.secondary {
  width: min(132px, 72%);
  animation-delay: 0.15s;
}

@keyframes placeholderDotPulse {
  0%,
  80%,
  100% {
    transform: translateY(0) scale(0.92);
    opacity: 0.35;
  }
  40% {
    transform: translateY(-2px) scale(1);
    opacity: 1;
  }
}

@keyframes placeholderShimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: -100% 50%;
  }
}
</style>
