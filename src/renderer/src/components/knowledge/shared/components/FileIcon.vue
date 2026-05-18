<script setup lang="ts">
/**
 * 文件图标组件
 * 根据文件类型显示对应的图标和样式
 */
import { computed } from 'vue'
import { getFileIconInfo } from '../composables/useFileIcon'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import styles from './FileIcon.module.css'

const props = withDefaults(
  defineProps<{
    /** 文件类型 */
    fileType: string
    /** 图标大小 */
    size?: number
  }>(),
  {
    size: 24
  }
)

const iconInfo = computed(() => getFileIconInfo(props.fileType))
</script>

<template>
  <div :class="[styles['file-icon'], styles[iconInfo.iconClass]]">
    <SvgIcon :name="iconInfo.iconName" :size="size" />
  </div>
</template>
