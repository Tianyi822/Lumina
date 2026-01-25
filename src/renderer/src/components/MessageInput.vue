<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'send', message: string): void
}>()

// 输入内容
const inputMessage = ref('')

// 当前选择的模型
const selectedModel = ref('默认模型')

// 压缩比例
const compressionRatio = ref(0)

// 模型选项
const modelOptions = ['默认模型', 'GPT-4', 'Claude', 'Gemini']

// 是否显示模型选择下拉
const showModelDropdown = ref(false)

function handleSend(): void {
  if (inputMessage.value.trim()) {
    emit('send', inputMessage.value.trim())
    inputMessage.value = ''
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    handleSend()
  }
}

function selectModel(model: string): void {
  selectedModel.value = model
  showModelDropdown.value = false
}

function toggleModelDropdown(): void {
  showModelDropdown.value = !showModelDropdown.value
}
</script>

<template>
  <div class="message-input-container">
    <div class="input-wrapper">
      <textarea
        v-model="inputMessage"
        class="input message-textarea"
        placeholder="输入命令或消息 ..."
        rows="3"
        @keydown="handleKeydown"
      ></textarea>
    </div>
    <div class="input-actions">
      <!-- 模型选择器 -->
      <div class="model-selector">
        <button class="btn model-btn" @click="toggleModelDropdown">
          <span class="model-icon">💻</span>
          <span>选择模型</span>
          <span class="dropdown-arrow">▾</span>
        </button>
        <div v-if="showModelDropdown" class="model-dropdown">
          <div
            v-for="model in modelOptions"
            :key="model"
            class="model-option"
            :class="{ active: model === selectedModel }"
            @click="selectModel(model)"
          >
            {{ model }}
          </div>
        </div>
      </div>

      <!-- 压缩比例 -->
      <div class="compression-info">
        <span class="compression-icon">↓</span>
        <span>压缩 ({{ compressionRatio }}%)</span>
      </div>

      <!-- 执行按钮 -->
      <button class="btn-primary execute-btn" @click="handleSend">
        <span>执行</span>
        <span class="shortcut-hint">⌘↵</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.message-input-container {
  padding: 16px 24px 24px;
  background-color: var(--theme-bg);
  border-top: 1px solid var(--theme-border);
}

.input-wrapper {
  margin-bottom: 12px;
}

.message-textarea {
  width: 100%;
  min-height: 80px;
  resize: vertical;
  font-family: var(--theme-font);
  line-height: 1.5;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-selector {
  position: relative;
}

.model-btn {
  display: flex;
  align-items: center;
  gap: 6px;
}

.model-icon {
  font-size: 14px;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--theme-text-secondary);
}

.model-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  min-width: 150px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  box-shadow: var(--theme-shadow);
  overflow: hidden;
  z-index: 100;
}

.model-option {
  padding: 10px 14px;
  font-size: 13px;
  color: var(--theme-text);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.model-option:hover {
  background-color: var(--theme-bg-hover);
}

.model-option.active {
  color: var(--theme-accent);
}

.compression-info {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--theme-text-secondary);
  font-size: 13px;
}

.compression-icon {
  font-size: 12px;
}

.execute-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.shortcut-hint {
  font-size: 11px;
  opacity: 0.7;
}
</style>
