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
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
}

.file-icon-pdf {
  background-color: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.file-icon-txt {
  background-color: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.file-icon-md {
  background-color: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.file-icon-doc {
  background-color: rgba(43, 87, 154, 0.15);
  color: #2b579a;
}

.file-icon-csv {
  background-color: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.file-icon-default {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}
</style>
