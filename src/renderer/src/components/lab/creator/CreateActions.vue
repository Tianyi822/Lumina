<script setup lang="ts">
import type { LabCreateType } from '@renderer/stores/lab/types'
import styles from './CreateActions.module.css'

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
  <div :class="styles['creator-footer']">
    <button :class="styles['btn']" :disabled="isCreating" @click="emit('close')">取消</button>
    <button
      :class="styles['btn-primary']"
      :disabled="!canCreate || isCreating"
      @click="emit('create')"
    >
      {{ isCreating ? createPhaseText : createType === 'existing' ? '选择并使用' : '创建并运行' }}
    </button>
  </div>
</template>
