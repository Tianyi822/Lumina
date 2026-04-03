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
        <button class="sm-button sm-button--small" :disabled="testing" @click.stop="handleTest">
          {{ testing ? '测试中...' : '测试' }}
        </button>
        <button class="sm-button sm-button--small" @click.stop="emit('edit', id)">编辑</button>
        <button
          class="sm-button sm-button--small sm-button--danger btn-danger-text"
          @click.stop="emit('delete', id)"
        >
          删除
        </button>
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
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
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
  background: var(--sm-color-surface-hover);
}

.model-name {
  font-weight: 500;
  color: var(--sm-color-text-primary);
  flex: 1;
}

.model-dimensions {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--sm-color-accent-12);
  border: 1px solid var(--sm-color-border-accent);
  color: var(--sm-color-accent-hover);
  border-radius: 999px;
  margin-right: 12px;
}

.expand-state {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
  margin-right: 12px;
}

.model-actions {
  display: flex;
  gap: 8px;
}

.btn-danger-text {
  color: var(--sm-color-status-danger);
}

.test-result {
  margin: 0 16px 8px;
  padding: 8px;
  border-radius: 4px;
  font-size: 13px;
}

.test-result.success {
  background: rgba(34, 197, 94, 0.15);
  color: var(--sm-color-status-success);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.test-result.error {
  background: rgba(239, 68, 68, 0.15);
  color: var(--sm-color-status-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.model-details {
  padding: 16px;
  border-top: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-1);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-item {
  display: flex;
  font-size: 13px;
}

.detail-label {
  color: var(--sm-color-text-secondary);
  min-width: 80px;
}

.detail-value {
  color: var(--sm-color-text-primary);
  font-family: var(--sm-font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
