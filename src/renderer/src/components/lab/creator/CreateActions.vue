<script setup lang="ts">
import type { LabCreateType } from '@renderer/stores/lab/types'

defineProps<{
  isCreating: boolean
  canCreate: boolean
  createType: LabCreateType
  createPhaseText: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'create'): void
}>()
</script>

<template>
  <div class="creator-footer">
    <button class="btn" :disabled="isCreating" @click="emit('close')">取消</button>
    <button class="btn-primary" :disabled="!canCreate || isCreating" @click="emit('create')">
      {{ isCreating ? createPhaseText : createType === 'existing' ? '选择并使用' : '创建并运行' }}
    </button>
  </div>
</template>

<style scoped>
.creator-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--sm-color-border-default);
  background-color: var(--sm-color-surface-1);
}

.btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  border-color: var(--sm-color-text-secondary);
  color: var(--sm-color-text-primary);
}

.btn:disabled,
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-accent);
  border: 1px solid var(--sm-color-accent);
  border-radius: 4px;
  color: var(--sm-color-bg-app);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
</style>
