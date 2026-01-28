<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EmbeddingConfig } from '@shared/types/config'

interface Props {
  id: string
  config: EmbeddingConfig
  isDefault: boolean
  testing: boolean
}

interface Emits {
  (e: 'edit', id: string): void
  (e: 'delete', id: string): void
  (e: 'test', id: string): void
  (e: 'set-default', id: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const testResult = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const displayName = computed(() => {
  return props.config.displayName || props.config.model
})

async function handleTest(): Promise<void> {
  testResult.value = null
  emit('test', props.id)
}
</script>

<template>
  <div class="model-item">
    <div class="model-header">
      <div class="model-info">
        <span class="model-name">{{ displayName }}</span>
        <span v-if="isDefault" class="badge badge-default">默认</span>
        <span class="model-dimensions">{{ config.dimensions }}维</span>
      </div>
      <div class="model-actions">
        <button
          v-if="!isDefault"
          class="btn-icon"
          title="设为默认"
          @click="emit('set-default', id)"
        >
          ⭐
        </button>
        <button class="btn-icon" title="测试连接" :disabled="testing" @click="handleTest">
          {{ testing ? '...' : '🔗' }}
        </button>
        <button class="btn-icon" title="编辑" @click="emit('edit', id)">✏️</button>
        <button class="btn-icon btn-icon-danger" title="删除" @click="emit('delete', id)">🗑️</button>
      </div>
    </div>

    <!-- 测试结果 -->
    <div v-if="testResult" class="test-result" :class="testResult.type">
      {{ testResult.message }}
    </div>

    <!-- 模型详情 -->
    <div class="model-details">
      <div class="detail-item">
        <span class="detail-label">API URL:</span>
        <span class="detail-value">{{ config.baseUrl }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">模型:</span>
        <span class="detail-value">{{ config.model }}</span>
      </div>
      <div v-if="config.apiKey" class="detail-item">
        <span class="detail-label">API Key:</span>
        <span class="detail-value">***{{ config.apiKey.slice(-4) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-item {
  padding: 16px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: var(--theme-background-secondary);
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-name {
  font-weight: 600;
  color: var(--theme-text);
}

.model-dimensions {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.badge-default {
  background: var(--theme-accent);
  color: white;
}

.model-actions {
  display: flex;
  gap: 4px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 16px;
  transition: background 0.2s;
}

.btn-icon:hover:not(:disabled) {
  background: var(--theme-border);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon-danger:hover {
  background: #ff4444;
  color: white;
}

.test-result {
  margin-top: 8px;
  padding: 8px;
  border-radius: 4px;
  font-size: 13px;
}

.test-result.success {
  background: #4caf50;
  color: white;
}

.test-result.error {
  background: #f44336;
  color: white;
}

.model-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--theme-border);
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
