<script setup lang="ts">
/**
 * 文件选择器标签页组件
 */
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import styles from './FileSelectorTabs.module.css'

type TabType = 'existing' | 'upload'

defineProps<{
  /** 当前激活的标签页 */
  activeTab: TabType
}>()

const emit = defineEmits<{
  (e: 'update:activeTab', tab: TabType): void
}>()
</script>

<template>
  <div :class="styles['file-selector-tabs']" role="tablist" aria-label="文件添加方式">
    <button
      type="button"
      role="tab"
      :class="[
        styles['file-selector-tabs__item'],
        { [styles['is-active']]: activeTab === 'existing' }
      ]"
      :aria-selected="activeTab === 'existing'"
      @click="emit('update:activeTab', 'existing')"
    >
      <SvgIcon name="attachment" :size="14" />
      <span>从已有文件选择</span>
    </button>
    <button
      type="button"
      role="tab"
      :class="[
        styles['file-selector-tabs__item'],
        { [styles['is-active']]: activeTab === 'upload' }
      ]"
      :aria-selected="activeTab === 'upload'"
      @click="emit('update:activeTab', 'upload')"
    >
      <SvgIcon name="upload" :size="14" />
      <span>上传新文件</span>
    </button>
  </div>
</template>
