<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EmbeddingConfig } from '@shared/types/config'

interface Props {
  id: string
  config: EmbeddingConfig
  testing: boolean
}

interface Emits {
  (e: 'edit', id: string): void
  (e: 'delete', id: string): void
  (e: 'test', id: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const expanded = ref(false)
const testResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const displayName = computed(() => {
  return props.config.displayName || props.config.model
})

function toggleExpand(): void {
  expanded.value = !expanded.value
}

async function handleTest(): Promise<void> {
  testResult.value = null
  emit('test', props.id)
}
</script>

<template>
  <div class="model-item">
    <div class="model-header" @click="toggleExpand">
      <span class="model-name">{{ displayName }}</span>
      <span class="model-dimensions">{{ config.dimensions }}维</span>
      <span class="expand-state">{{ expanded ? '收起' : '展开' }}</span>
      <div class="model-actions">
        <button class="btn btn-small" :disabled="testing" @click.stop="handleTest">
          {{ testing ? '测试中...' : '测试' }}
        </button>
        <button class="btn btn-small" @click.stop="emit('edit', id)">编辑</button>
        <button class="btn btn-small btn-danger-text" @click.stop="emit('delete', id)">删除</button>
      </div>
    </div>

    <!-- 测试结果 -->
    <div v-if="testResult" class="test-result" :class="testResult.type">
      {{ testResult.message }}
    </div>

    <!-- 模型详情（展开时显示） -->
    <div v-if="expanded" class="model-details">
      <div class="detail-item">
        <span class="detail-label">API URL:</span>
        <span class="detail-value">{{ config.baseUrl }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">模型:</span>
        <span class="detail-value">{{ config.model }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-item {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: hidden;
}

.model-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.model-header:hover {
  background-color: var(--theme-bg-hover);
}

.model-name {
  font-weight: 500;
  color: var(--theme-text);
  flex: 1;
}

.model-dimensions {
  font-size: 11px;
  padding: 2px 8px;
  background-color: var(--theme-accent);
  color: var(--theme-bg);
  border-radius: 4px;
  margin-right: 12px;
}

.expand-state {
  font-size: 12px;
  color: var(--theme-text-tertiary);
  margin-right: 12px;
}

.model-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-danger-text {
  color: var(--theme-danger);
  border-color: transparent;
}

.btn-danger-text:hover {
  background-color: rgba(248, 81, 73, 0.1);
  border-color: var(--theme-danger);
}

.test-result {
  margin: 0 16px 8px;
  padding: 8px;
  border-radius: 4px;
  font-size: 13px;
}

.test-result.success {
  background: rgba(34, 197, 94, 0.15);
  color: var(--theme-success);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.test-result.error {
  background: rgba(239, 68, 68, 0.15);
  color: var(--theme-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.model-details {
  padding: 16px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-item {
  display: flex;
  font-size: 13px;
}

.detail-label {
  color: var(--theme-text-secondary);
  min-width: 80px;
}

.detail-value {
  color: var(--theme-text);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
