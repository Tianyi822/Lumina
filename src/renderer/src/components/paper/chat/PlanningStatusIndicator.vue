<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import styles from './PlanningStatusIndicator.module.css'

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
  <span :class="styles['paper-planning-status']" aria-live="polite">
    <span
      :key="activeText"
      :class="[styles['paper-planning-status__text'], styles['paper-planning-status--animating']]"
      :data-text="activeText"
    >
      <span
        v-for="(char, index) in chars"
        :key="`${activeText}-${index}`"
        :class="styles['paper-planning-status__char']"
        :style="{ '--paper-planning-status-stagger-index': index }"
      >
        {{ char }}
      </span>
    </span>
  </span>
</template>
