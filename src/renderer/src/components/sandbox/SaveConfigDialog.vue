<script setup lang="ts">
import { ref } from 'vue'

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
  <div v-if="visible" class="save-dialog-overlay" @click.self="handleClose">
    <div class="save-dialog">
      <div class="save-dialog-header">
        <h4>保存配置</h4>
        <button class="close-btn small" @click="handleClose">×</button>
      </div>
      <div class="save-dialog-body">
        <div class="form-field">
          <label>配置名称</label>
          <input
            v-model="configName"
            type="text"
            class="input"
            placeholder="请输入配置名称"
            @keydown="handleKeydown"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
          />
        </div>
      </div>
      <div class="save-dialog-footer">
        <button class="btn" @click="handleClose">取消</button>
        <button class="btn-primary" :disabled="!configName.trim()" @click="handleSave">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.save-dialog-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.save-dialog {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  width: 320px;
  overflow: hidden;
}

.save-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--theme-border);
}

.save-dialog-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.close-btn.small {
  width: 24px;
  height: 24px;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn.small:hover {
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
}

.save-dialog-body {
  padding: 16px;
}

.form-field {
  margin-bottom: 0;
}

.form-field label {
  display: block;
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

.input {
  width: 100%;
  padding: 8px 12px;
  font-family: var(--theme-font);
  font-size: 13px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
}

.input:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.save-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
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

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
