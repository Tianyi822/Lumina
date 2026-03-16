<script setup lang="ts">
import type { SandboxCreateType } from '@renderer/stores/sandbox/types'

defineProps<{
  isCreating: boolean
  canCreate: boolean
  createType: SandboxCreateType
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
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.btn:disabled,
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: var(--theme-accent);
  border: 1px solid var(--theme-accent);
  border-radius: 4px;
  color: var(--theme-bg);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
</style>
