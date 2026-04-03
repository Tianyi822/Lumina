<script setup lang="ts">
/**
 * 文件图标组件
 * 根据文件类型显示对应的图标和样式
 */
import { computed } from 'vue'
import { getFileIconInfo } from '../composables/useFileIcon'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

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
  <div :class="['file-icon', iconInfo.iconClass]">
    <SvgIcon :name="iconInfo.iconName" :size="size" />
  </div>
</template>

<style scoped>
.file-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 10px;
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-secondary);
  flex-shrink: 0;
}

.file-icon-pdf,
.file-icon-txt,
.file-icon-md,
.file-icon-doc,
.file-icon-csv,
.file-icon-xlsx,
.file-icon-default {
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-secondary);
}
</style>
