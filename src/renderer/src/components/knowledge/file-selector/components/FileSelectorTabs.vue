<script setup lang="ts">
/**
 * 文件选择器标签页组件
 */

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
  <div class="tabs">
    <button
      :class="['tab', { active: activeTab === 'existing' }]"
      @click="emit('update:activeTab', 'existing')"
    >
      从已有文件选择
    </button>
    <button
      :class="['tab', { active: activeTab === 'upload' }]"
      @click="emit('update:activeTab', 'upload')"
    >
      上传新文件
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  padding: 0 24px;
  border-bottom: 1px solid var(--theme-border);
  gap: 4px;
}

.tab {
  padding: 12px 20px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--theme-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: -1px;
}

.tab:hover {
  color: var(--theme-text);
}

.tab.active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
}
</style>
