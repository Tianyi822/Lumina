<script setup lang="ts">
import { ref } from 'vue'
import PromptSettings from './PromptSettings.vue'
import type { PromptConfig } from '@renderer/types'

// ==================== Props & Emits ====================
defineProps<{
  modelValue: PromptConfig
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: PromptConfig): void
  (e: 'reset-success'): void
}>()

// ==================== State ====================
const activeTab = ref<'basic'>('basic')

// ==================== Methods ====================
function handleUpdateConfig(value: PromptConfig): void {
  emit('update:modelValue', value)
}

function handleResetSuccess(): void {
  emit('reset-success')
}
</script>

<template>
  <div class="prompt-engineering-settings">
    <!-- 子标签页 -->
    <div class="sub-tabs">
      <button
        class="sub-tab-btn"
        :class="{ active: activeTab === 'basic' }"
        @click="activeTab = 'basic'"
      >
        基础配置
      </button>
    </div>

    <!-- 内容区域 -->
    <div class="tab-content-wrapper">
      <PromptSettings
        v-if="activeTab === 'basic'"
        :model-value="modelValue"
        @update:model-value="handleUpdateConfig"
        @reset-success="handleResetSuccess"
      />
    </div>
  </div>
</template>

<style scoped>
.prompt-engineering-settings {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sub-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 16px 0;
  border-bottom: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.sub-tab-btn {
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--theme-text-secondary);
  font-family: var(--theme-font);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: -1px;
}

.sub-tab-btn:hover {
  color: var(--theme-text);
}

.sub-tab-btn.active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
}

.tab-content-wrapper {
  flex: 1;
  overflow-y: auto;
}
</style>
