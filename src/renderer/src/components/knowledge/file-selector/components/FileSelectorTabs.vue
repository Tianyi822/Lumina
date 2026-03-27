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
      :class="[
        'sm-tab',
        'tab',
        { active: activeTab === 'existing', 'is-active': activeTab === 'existing' }
      ]"
      @click="emit('update:activeTab', 'existing')"
    >
      从已有文件选择
    </button>
    <button
      :class="[
        'sm-tab',
        'tab',
        { active: activeTab === 'upload', 'is-active': activeTab === 'upload' }
      ]"
      @click="emit('update:activeTab', 'upload')"
    >
      上传新文件
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: var(--sm-space-2);
  padding: 0 var(--sm-space-5) var(--sm-space-4);
}

.tab {
  flex: 1;
  justify-content: center;
  text-align: center;
}
</style>
