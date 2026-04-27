<script setup lang="ts">
/**
 * 文件选择器标签页组件
 */
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

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
  <div class="file-selector-tabs" role="tablist" aria-label="文件添加方式">
    <button
      type="button"
      role="tab"
      :class="[
        'file-selector-tabs__item',
        { 'is-active': activeTab === 'existing' }
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
        'file-selector-tabs__item',
        { 'is-active': activeTab === 'upload' }
      ]"
      :aria-selected="activeTab === 'upload'"
      @click="emit('update:activeTab', 'upload')"
    >
      <SvgIcon name="upload" :size="14" />
      <span>上传新文件</span>
    </button>
  </div>
</template>

<style scoped>
.file-selector-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  margin: 0 var(--sm-space-5) var(--sm-space-4);
  padding: 3px;
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: 10px;
  background: var(--sm-color-surface-2);
}

.file-selector-tabs__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  height: 34px;
  padding: 0 var(--sm-space-3);
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    box-shadow var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.file-selector-tabs__item span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-selector-tabs__item:hover:not(.is-active) {
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-primary);
}

.file-selector-tabs__item.is-active {
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-primary);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.file-selector-tabs__item:focus-visible {
  outline: 2px solid var(--sm-focus-ring-color);
  outline-offset: 2px;
}

@media (max-width: 720px) {
  .file-selector-tabs {
    margin-right: var(--sm-space-4);
    margin-left: var(--sm-space-4);
  }
}
</style>
