<script setup lang="ts">
/**
 * 文件选择器头部组件
 */
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import styles from './FileSelectorHeader.module.css'

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div :class="['sm-pane-header', styles['file-selector-header']]">
    <div :class="styles['file-selector-header__copy']">
      <h2>添加文件</h2>
    </div>
    <button class="sm-icon-button close-btn" @click="emit('close')">
      <SvgIcon name="close" :size="16" />
    </button>
  </div>
</template>
