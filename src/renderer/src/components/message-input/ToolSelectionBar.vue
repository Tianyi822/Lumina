<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { KnowledgeBase, MCPTool } from '@renderer/types'
import MCPToolsPanel from '@renderer/components/MCPToolsPanel.vue'
import KnowledgeBasePanel from '@renderer/components/KnowledgeBasePanel.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import SandboxToolsToggle from '@renderer/components/sandbox/SandboxToolsToggle.vue'
import { SUPPORTED_DOC_TYPES } from './attachmentUtils'

const props = defineProps<{
  isSending?: boolean
  selectedModel?: string
  modelOptions: string[]
  selectedTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableSandboxTools?: boolean
  totalAttachmentCount?: number
  variant?: 'default' | 'compact'
}>()

const emit = defineEmits<{
  (e: 'update:selectedModel', value: string): void
  (e: 'update:selectedTools', value: MCPTool[]): void
  (e: 'update:selectedKnowledgeBases', value: KnowledgeBase[]): void
  (e: 'update:enableSandboxTools', value: boolean): void
  (e: 'upload'): void
  (e: 'send'): void
  (e: 'stop'): void
}>()

const showModelDropdown = ref(false)
const modelSelectorRef = ref<HTMLElement | null>(null)
const supportedDocumentLabel = SUPPORTED_DOC_TYPES.map((type) => type.slice(1)).join(', ')

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
  <div class="input-actions" :class="{ 'input-actions--compact': props.variant === 'compact' }">
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
      :compact="props.variant === 'compact'"
      :selected-tools="props.selectedTools"
      @tools-selected="emit('update:selectedTools', $event)"
    />

    <KnowledgeBasePanel
      :compact="props.variant === 'compact'"
      :selected-knowledge-bases="props.selectedKnowledgeBases"
      @selection-change="emit('update:selectedKnowledgeBases', $event)"
    />

    <SandboxToolsToggle
      :compact="props.variant === 'compact'"
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
        :title="`上传文件 (文档: ${supportedDocumentLabel} / 图片: jpg, png, webp, bmp, tiff)`"
        @click="emit('upload')"
      >
        <SvgIcon name="attachment" :size="18" />
        <span v-if="(props.totalAttachmentCount || 0) > 0" class="doc-count">
          {{ props.totalAttachmentCount }}
        </span>
      </button>

      <button
        v-if="!props.isSending"
        class="btn-primary execute-btn"
        :class="{ 'execute-btn--compact': props.variant === 'compact' }"
        title="执行"
        aria-label="执行"
        @click="emit('send')"
      >
        <SvgIcon v-if="props.variant === 'compact'" name="send" :size="17" />
        <template v-else>
          <span>执行</span>
          <span class="shortcut-hint">⌘↵</span>
        </template>
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
  gap: var(--sm-space-2);
  flex-wrap: wrap;
}

.input-actions--compact {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: var(--sm-space-2);
}

.input-actions--compact .model-selector {
  grid-column: 1 / -1;
  width: 100%;
}

.input-actions--compact .model-btn {
  width: 100%;
  justify-content: space-between;
  min-width: 0;
}

.input-actions--compact .model-btn span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.input-actions--compact .model-dropdown {
  width: 100%;
  min-width: 0;
}

.input-actions--compact .action-buttons-group {
  grid-column: 4;
  gap: var(--sm-space-2);
  margin-left: 0;
}

.input-actions--compact :deep(.mcp-tools-panel),
.input-actions--compact :deep(.kb-panel) {
  width: min(320px, calc(100vw - 48px));
  max-height: 420px;
}

.model-selector {
  position: relative;
}

.model-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
}

.model-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dropdown-arrow {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
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
  background: var(--sm-color-surface-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  overflow: hidden;
  z-index: 100;
}

.model-option {
  padding: 9px 14px;
  font-size: 13px;
  color: var(--sm-color-text-primary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
  white-space: nowrap;
}

.model-option:hover {
  background: var(--sm-color-surface-hover);
}

.model-option.active {
  background: var(--sm-color-surface-selected);
  color: var(--sm-color-text-selected);
}

.model-option.empty {
  color: var(--sm-color-text-tertiary);
  font-style: italic;
  cursor: default;
}

.model-option.empty:hover {
  background-color: transparent;
}

.action-buttons-group {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
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
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 50%;
  color: var(--sm-color-text-tertiary);
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.document-upload-btn:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.document-upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.document-upload-btn.has-docs {
  color: var(--sm-color-text-primary);
  border-color: var(--sm-color-border-selected);
  background: var(--sm-color-surface-selected);
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
  background: var(--sm-color-surface-selected);
  border: 1px solid var(--sm-color-border-selected);
  color: var(--sm-color-text-primary);
  font-size: 10px;
  font-weight: 600;
  border-radius: 50%;
}

.voice-input-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 50%;
  color: var(--sm-color-text-tertiary);
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.voice-input-btn:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.voice-input-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-input-btn.recording {
  color: var(--sm-color-accent-hover);
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-accent-12);
}

.execute-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--sm-color-accent-12);
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-text-primary);
}

.execute-btn--compact {
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  gap: 0;
}

.execute-btn:hover {
  background: var(--sm-color-accent-18);
  border-color: var(--sm-color-accent-28);
}

.stop-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--sm-color-status-danger);
}

.stop-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: var(--sm-color-status-danger);
}

.shortcut-hint {
  font-size: 11px;
  opacity: 0.6;
}

@media (max-width: 768px) {
  .action-buttons-group {
    margin-left: 0;
    width: 100%;
  }
}
</style>
