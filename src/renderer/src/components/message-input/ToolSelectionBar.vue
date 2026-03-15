<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { KnowledgeBase, MCPTool } from '@renderer/types'
import MCPToolsPanel from '@renderer/components/MCPToolsPanel.vue'
import KnowledgeBasePanel from '@renderer/components/KnowledgeBasePanel.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import SandboxToolsToggle from '@renderer/components/sandbox/SandboxToolsToggle.vue'

const props = defineProps<{
  isSending?: boolean
  selectedModel?: string
  modelOptions: string[]
  selectedTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableSandboxTools?: boolean
  totalAttachmentCount?: number
  voiceRecognitionEnabled?: boolean
  isRecording?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:selectedModel', value: string): void
  (e: 'update:selectedTools', value: MCPTool[]): void
  (e: 'update:selectedKnowledgeBases', value: KnowledgeBase[]): void
  (e: 'update:enableSandboxTools', value: boolean): void
  (e: 'upload'): void
  (e: 'toggle-voice'): void
  (e: 'send'): void
  (e: 'stop'): void
}>()

const showModelDropdown = ref(false)
const modelSelectorRef = ref<HTMLElement | null>(null)

function selectModel(model: string): void {
  emit('update:selectedModel', model)
  showModelDropdown.value = false
}

function toggleModelDropdown(): void {
  if (!props.isSending) {
    showModelDropdown.value = !showModelDropdown.value
  }
}

function handleClickOutside(event: MouseEvent): void {
  if (!showModelDropdown.value || !modelSelectorRef.value) {
    return
  }

  const target = event.target as Node
  if (!modelSelectorRef.value.contains(target)) {
    showModelDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="input-actions">
    <div ref="modelSelectorRef" class="model-selector">
      <button class="btn model-btn" :disabled="props.isSending" @click="toggleModelDropdown">
        <span>{{ props.selectedModel || '选择模型' }}</span>
        <span class="dropdown-arrow" :class="{ open: showModelDropdown }">▼</span>
      </button>
      <div v-if="showModelDropdown" class="model-dropdown">
        <div v-if="props.modelOptions.length === 0" class="model-option empty">暂无模型配置</div>
        <div
          v-for="model in props.modelOptions"
          :key="model"
          class="model-option"
          :class="{ active: model === props.selectedModel }"
          @click="selectModel(model)"
        >
          {{ model }}
        </div>
      </div>
    </div>

    <MCPToolsPanel
      :selected-tools="props.selectedTools"
      @tools-selected="emit('update:selectedTools', $event)"
    />

    <KnowledgeBasePanel
      :selected-knowledge-bases="props.selectedKnowledgeBases"
      @selection-change="emit('update:selectedKnowledgeBases', $event)"
    />

    <SandboxToolsToggle
      :model-value="props.enableSandboxTools"
      :disabled="props.isSending"
      @update:model-value="emit('update:enableSandboxTools', $event)"
      @change="emit('update:enableSandboxTools', $event)"
    />

    <div class="action-buttons-group">
      <button
        class="document-upload-btn"
        :class="{ 'has-docs': (props.totalAttachmentCount || 0) > 0 }"
        :disabled="props.isSending"
        title="上传文件 (文档: txt, md, pdf, doc, docx, csv, pptx / 图片: jpg, png, webp, bmp, tiff)"
        @click="emit('upload')"
      >
        <SvgIcon name="attachment" :size="18" />
        <span v-if="(props.totalAttachmentCount || 0) > 0" class="doc-count">
          {{ props.totalAttachmentCount }}
        </span>
      </button>

      <button
        v-if="props.voiceRecognitionEnabled"
        class="voice-input-btn"
        :class="{ recording: props.isRecording }"
        :disabled="props.isSending"
        :title="props.isRecording ? '正在录音...点击停止' : '语音输入'"
        @click="emit('toggle-voice')"
      >
        <SvgIcon name="microphone" :size="18" />
      </button>

      <button v-if="!props.isSending" class="btn-primary execute-btn" @click="emit('send')">
        <span>执行</span>
        <span class="shortcut-hint">⌘↵</span>
      </button>
      <button v-else class="btn-danger stop-btn" @click="emit('stop')">
        <span>停止</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.input-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.model-selector {
  position: relative;
}

.model-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.model-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--theme-text-tertiary);
  transition: transform 0.2s ease;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.model-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  min-width: 200px;
  background:
    linear-gradient(
      135deg,
      var(--glass-white-03, rgba(255, 255, 255, 0.03)) 0%,
      var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
    ),
    linear-gradient(
      225deg,
      var(--glass-white-023, rgba(255, 255, 255, 0.023)) 0%,
      var(--glass-white-007, rgba(255, 255, 255, 0.007)) 100%
    ),
    var(--theme-bg-secondary);
  backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  -webkit-backdrop-filter: blur(28px) saturate(220%) brightness(1.12);
  border: 1px solid var(--glass-white-12, rgba(255, 255, 255, 0.12));
  border-radius: var(--theme-radius);
  box-shadow:
    0 10px 36px rgba(0, 0, 0, 0.2),
    0 3px 10px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 var(--glass-white-15, rgba(255, 255, 255, 0.15));
  overflow: hidden;
  z-index: 100;
}

.model-option {
  padding: 9px 14px;
  font-size: 13px;
  color: var(--theme-text);
  cursor: pointer;
  transition: all 0.12s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  white-space: nowrap;
}

.model-option:hover {
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  color: var(--theme-text);
}

.model-option.active {
  color: var(--theme-accent);
}

.model-option.empty {
  color: var(--theme-text-tertiary);
  font-style: italic;
  cursor: default;
}

.model-option.empty:hover {
  background-color: transparent;
}

.action-buttons-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.document-upload-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: linear-gradient(
    135deg,
    var(--glass-white-05, rgba(255, 255, 255, 0.05)) 0%,
    var(--glass-white-027, rgba(255, 255, 255, 0.027)) 100%
  );
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  border-radius: 50%;
  color: var(--theme-text-tertiary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.15),
    0 2px 6px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 var(--glass-white-15, rgba(255, 255, 255, 0.15));
}

.document-upload-btn:hover {
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  border-color: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  color: var(--theme-text);
}

.document-upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.document-upload-btn.has-docs {
  color: var(--theme-accent);
  border-color: rgba(70, 170, 143, 0.3);
  background: rgba(70, 170, 143, 0.1);
}

.doc-count {
  position: absolute;
  top: -4px;
  right: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: var(--theme-accent);
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.voice-input-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: linear-gradient(
    135deg,
    var(--glass-white-05, rgba(255, 255, 255, 0.05)) 0%,
    var(--glass-white-027, rgba(255, 255, 255, 0.027)) 100%
  );
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  border-radius: 50%;
  color: var(--theme-text-tertiary);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.15),
    0 2px 6px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 var(--glass-white-15, rgba(255, 255, 255, 0.15));
}

.voice-input-btn:hover {
  background: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  border-color: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  color: var(--theme-text);
}

.voice-input-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-input-btn.recording {
  color: #7dd3fc;
  border-color: rgba(125, 211, 252, 0.4);
  background: rgba(125, 211, 252, 0.12);
  animation: voice-pulse 1.5s ease-in-out infinite;
}

@keyframes voice-pulse {
  0%,
  100% {
    box-shadow:
      0 4px 16px rgba(125, 211, 252, 0.22),
      0 2px 6px rgba(0, 0, 0, 0.1);
  }
  50% {
    box-shadow:
      0 4px 24px rgba(125, 211, 252, 0.36),
      0 2px 10px rgba(125, 211, 252, 0.18);
  }
}

.execute-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #70d75c;
  border-color: rgba(112, 215, 92, 0.4);
}

.execute-btn:hover {
  background: #5fc34a;
}

.stop-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--theme-danger);
}

.stop-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: var(--theme-danger);
}

.shortcut-hint {
  font-size: 11px;
  opacity: 0.6;
}
</style>
