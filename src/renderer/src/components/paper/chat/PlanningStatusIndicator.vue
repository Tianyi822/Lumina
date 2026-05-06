<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const DEFAULT_PHRASES = [
  '正在思考',
  '正在规划',
  '正在计划中',
  '正在拆分任务',
  '正在整理步骤',
  '正在分析问题',
  '正在生成执行计划'
]

const props = withDefaults(
  defineProps<{
    text?: string
    phrases?: string[]
    intervalMs?: number
  }>(),
  {
    text: '',
    phrases: () => [
      '正在思考',
      '正在规划',
      '正在计划中',
      '正在拆分任务',
      '正在整理步骤',
      '正在分析问题',
      '正在生成执行计划'
    ],
    intervalMs: 4000
  }
)

const phraseIndex = ref(0)
let timerId: number | null = null

const activeText = computed(() => {
  if (props.text.trim()) {
    return props.text.trim()
  }
  return props.phrases[phraseIndex.value % props.phrases.length] || DEFAULT_PHRASES[0]
})

const chars = computed(() => Array.from(activeText.value))

function clearRotationTimer(): void {
  if (timerId !== null) {
    window.clearInterval(timerId)
    timerId = null
  }
}

function startRotationTimer(): void {
  clearRotationTimer()
  if (props.text.trim() || props.phrases.length <= 1) {
    return
  }

  timerId = window.setInterval(() => {
    phraseIndex.value = (phraseIndex.value + 1) % props.phrases.length
  }, props.intervalMs)
}

watch(
  () => [props.text, props.phrases, props.intervalMs] as const,
  () => {
    phraseIndex.value = 0
    startRotationTimer()
  },
  { deep: true }
)

onMounted(() => {
  startRotationTimer()
})

onBeforeUnmount(() => {
  clearRotationTimer()
})
</script>

<template>
  <span class="paper-planning-status" aria-live="polite">
    <span
      :key="activeText"
      class="paper-planning-status__text paper-planning-status--animating"
      :data-text="activeText"
    >
      <span
        v-for="(char, index) in chars"
        :key="`${activeText}-${index}`"
        class="paper-planning-status__char"
        :style="{ '--paper-planning-status-stagger-index': index }"
      >
        {{ char }}
      </span>
    </span>
  </span>
</template>

<style scoped>
.paper-planning-status {
  --paper-planning-status-dur: 420ms;
  --paper-planning-status-distance: 6px;
  --paper-planning-status-stagger: 42ms;
  --paper-planning-status-blur: 2px;
  --paper-planning-status-ease: cubic-bezier(0.34, 1.18, 0.64, 1);
  --paper-planning-status-shine-edge: rgba(255, 255, 255, 0.1);
  --paper-planning-status-shine-peak: rgba(255, 255, 255, 0.38);
  display: inline-flex;
  align-items: baseline;
  min-width: 0;
}

:global([data-theme='lumina-light']) .paper-planning-status {
  --paper-planning-status-shine-edge: rgba(255, 255, 255, 0.16);
  --paper-planning-status-shine-peak: rgba(255, 255, 255, 0.68);
}

.paper-planning-status__text {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  overflow: hidden;
  color: var(--sm-color-text-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.paper-planning-status__text::after {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    105deg,
    transparent 12%,
    var(--paper-planning-status-shine-edge) 34%,
    var(--paper-planning-status-shine-peak) 50%,
    var(--paper-planning-status-shine-edge) 66%,
    transparent 88%
  );
  background-position: 135% 0;
  background-size: 240% 100%;
  color: transparent;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: paperPlanningStatusLightSweep 1800ms ease-out 520ms both;
}

.paper-planning-status__char {
  display: inline-block;
  will-change: transform, opacity, filter;
}

.paper-planning-status--animating .paper-planning-status__char {
  animation: paperPlanningStatusCharPopIn var(--paper-planning-status-dur)
    var(--paper-planning-status-ease) both;
  animation-delay: calc(
    var(--paper-planning-status-stagger) * var(--paper-planning-status-stagger-index)
  );
}

@keyframes paperPlanningStatusCharPopIn {
  0% {
    transform: translateY(var(--paper-planning-status-distance));
    opacity: 0;
    filter: blur(var(--paper-planning-status-blur));
  }

  100% {
    transform: translateY(0);
    opacity: 1;
    filter: blur(0);
  }
}

@keyframes paperPlanningStatusLightSweep {
  0% {
    background-position: 135% 0;
    opacity: 0;
  }

  18% {
    opacity: 1;
  }

  100% {
    background-position: -135% 0;
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .paper-planning-status--animating .paper-planning-status__char {
    animation: none !important;
  }

  .paper-planning-status__text::after {
    animation: none !important;
    opacity: 0;
  }
}
</style>
