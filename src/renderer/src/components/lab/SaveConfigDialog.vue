<script setup lang="ts">
import { ref } from 'vue'
import styles from './SaveConfigDialog.module.css'

defineProps<{
  visible: boolean
}>()

const configName = ref('')
const isComposing = ref(false)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', name: string): void
}>()

function handleCompositionStart(): void {
  isComposing.value = true
}

function handleCompositionEnd(): void {
  isComposing.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (isComposing.value || event.key !== 'Enter') return
  event.preventDefault()
  handleSave()
}

function handleSave(): void {
  if (!configName.value.trim()) return
  emit('save', configName.value.trim())
  configName.value = ''
}

function handleClose(): void {
  configName.value = ''
  emit('close')
}
</script>

<template>
  <div v-if="visible" :class="styles['save-dialog-overlay']" @click.self="handleClose">
    <div :class="styles['save-dialog']">
      <div :class="styles['save-dialog-header']">
        <h4>保存配置</h4>
        <button :class="[styles['close-btn'], styles['small']]" @click="handleClose">×</button>
      </div>
      <div :class="styles['save-dialog-body']">
        <div :class="styles['form-field']">
          <label>配置名称</label>
          <input
            v-model="configName"
            type="text"
            :class="styles['input']"
            placeholder="请输入配置名称"
            @keydown="handleKeydown"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
          />
        </div>
      </div>
      <div :class="styles['save-dialog-footer']">
        <button :class="styles['btn']" @click="handleClose">取消</button>
        <button :class="styles['btn-primary']" :disabled="!configName.trim()" @click="handleSave">
          保存
        </button>
      </div>
    </div>
  </div>
</template>
