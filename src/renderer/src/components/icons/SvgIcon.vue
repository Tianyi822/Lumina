<script setup lang="ts">
import { computed } from 'vue'
import { icons } from './icons'
import styles from './SvgIcon.module.css'

interface Props {
  name: string
  size?: number | string
  color?: string
  spin?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 16,
  color: 'currentColor',
  spin: false
})

const iconData = computed(() => {
  return icons[props.name] || icons['info']
})

const iconSize = computed(() => {
  return typeof props.size === 'number' ? `${props.size}px` : props.size
})

const iconStyle = computed(() => {
  return {
    color: props.color === 'currentColor' ? 'inherit' : props.color
  }
})
</script>

<template>
  <svg
    :class="[styles.icon, { [styles.spin]: spin }]"
    :viewBox="iconData.viewBox"
    :width="iconSize"
    :height="iconSize"
    :style="iconStyle"
    :fill="iconData.fill || 'none'"
    :stroke="iconData.stroke || 'none'"
    :stroke-width="iconData.strokeWidth"
    aria-hidden="true"
  >
    <!-- 单个 path -->
    <path v-if="iconData.path" :d="iconData.path" />

    <!-- 多个 path -->
    <template v-else-if="iconData.paths">
      <path v-for="(p, i) in iconData.paths" :key="i" :d="p" />
    </template>

    <!-- 复杂 SVG 元素（circle, line, polyline 等） -->
    <!-- eslint-disable vue/no-v-html -->
    <g v-if="iconData.elements" v-html="iconData.elements" />
    <!-- eslint-enable vue/no-v-html -->
  </svg>
</template>
