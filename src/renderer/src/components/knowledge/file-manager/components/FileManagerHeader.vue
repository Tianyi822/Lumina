<script setup lang="ts">
/**
 * 文件管理模态框头部组件
 */
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import styles from './FileManagerHeader.module.css'

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <div :class="['sm-pane-header', styles['file-manager-header']]">
    <h2>文件管理</h2>
    <button class="sm-icon-button close-btn" @click="emit('close')">
      <SvgIcon name="close" :size="16" />
    </button>
  </div>
</template>
