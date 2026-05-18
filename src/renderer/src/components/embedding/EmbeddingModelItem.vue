<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EmbeddingConfig } from '@shared/types/config'
import styles from './EmbeddingModelItem.module.css'

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
  <div :class="styles['model-item']">
    <div :class="styles['model-header']" @click="toggleExpand">
      <span :class="styles['model-name']">{{ displayName }}</span>
      <span :class="styles['model-dimensions']">{{ config.dimensions }}维</span>
      <span :class="styles['expand-state']">{{ expanded ? '收起' : '展开' }}</span>
      <div :class="styles['model-actions']">
        <button class="sm-button sm-button--small" :disabled="testing" @click.stop="handleTest">
          {{ testing ? '测试中...' : '测试' }}
        </button>
        <button class="sm-button sm-button--small" @click.stop="emit('edit', id)">编辑</button>
        <button
          :class="['sm-button', 'sm-button--small', 'sm-button--danger', styles['btn-danger-text']]"
          @click.stop="emit('delete', id)"
        >
          删除
        </button>
      </div>
    </div>

    <!-- 测试结果 -->
    <div v-if="testResult" :class="[styles['test-result'], styles[testResult.type]]">
      {{ testResult.message }}
    </div>

    <!-- 模型详情（展开时显示） -->
    <div v-if="expanded" :class="styles['model-details']">
      <div :class="styles['detail-item']">
        <span :class="styles['detail-label']">API URL:</span>
        <span :class="styles['detail-value']">{{ config.baseUrl }}</span>
      </div>
      <div :class="styles['detail-item']">
        <span :class="styles['detail-label']">模型:</span>
        <span :class="styles['detail-value']">{{ config.model }}</span>
      </div>
    </div>
  </div>
</template>
