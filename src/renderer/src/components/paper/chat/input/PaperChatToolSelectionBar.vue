<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { KnowledgeBase, MCPTool } from '@renderer/types'
import PaperChatMcpToolsPanel from '@renderer/components/paper/chat/input/PaperChatMcpToolsPanel.vue'
import PaperChatKnowledgeBasePanel from '@renderer/components/paper/chat/input/PaperChatKnowledgeBasePanel.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import LabToolsToggle from '@renderer/components/lab/LabToolsToggle.vue'
import { SUPPORTED_DOC_TYPES } from './attachmentUtils'

const props = defineProps<{
  isSending?: boolean
  selectedModel?: string
  modelOptions: string[]
  selectedTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableLabTools?: boolean
  enablePlanMode?: boolean
  totalAttachmentCount?: number
  variant?: 'default' | 'compact'
}>()

const emit = defineEmits<{
  (e: 'update:selectedModel', value: string): void
  (e: 'update:selectedTools', value: MCPTool[]): void
  (e: 'update:selectedKnowledgeBases', value: KnowledgeBase[]): void
  (e: 'update:enableLabTools', value: boolean): void
  (e: 'update:enablePlanMode', value: boolean): void
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
  <div
    class="paper-chat-input-toolbar"
    :class="{ 'paper-chat-input-toolbar--compact': props.variant === 'compact' }"
  >
    <div ref="modelSelectorRef" class="paper-chat-input-toolbar__model-selector">
      <button
        class="btn paper-chat-input-toolbar__model-button"
        :disabled="props.isSending"
        @click="toggleModelDropdown"
      >
        <span>{{ props.selectedModel || '选择模型' }}</span>
        <span class="paper-chat-input-toolbar__dropdown-arrow" :class="{ open: showModelDropdown }"
          >▼</span
        >
      </button>
      <div v-if="showModelDropdown" class="paper-chat-input-toolbar__model-dropdown">
        <div
          v-if="props.modelOptions.length === 0"
          class="paper-chat-input-toolbar__model-option empty"
        >
          暂无模型配置
        </div>
        <div
          v-for="model in props.modelOptions"
          :key="model"
          class="paper-chat-input-toolbar__model-option"
          :class="{ active: model === props.selectedModel }"
          @click="selectModel(model)"
        >
          {{ model }}
        </div>
      </div>
    </div>

    <PaperChatMcpToolsPanel
      :compact="props.variant === 'compact'"
      :selected-tools="props.selectedTools"
      @tools-selected="emit('update:selectedTools', $event)"
    />

    <PaperChatKnowledgeBasePanel
      :compact="props.variant === 'compact'"
      :selected-knowledge-bases="props.selectedKnowledgeBases"
      @selection-change="emit('update:selectedKnowledgeBases', $event)"
    />

    <LabToolsToggle
      :compact="props.variant === 'compact'"
      :model-value="props.enableLabTools"
      :disabled="props.isSending"
      @update:model-value="emit('update:enableLabTools', $event)"
      @change="emit('update:enableLabTools', $event)"
    />

    <button
      class="paper-chat-input-toolbar__plan-toggle"
      :class="{ active: props.enablePlanMode }"
      :disabled="props.isSending"
      title="规划模式：模型将先拆解任务为步骤再逐步执行"
      @click="emit('update:enablePlanMode', !props.enablePlanMode)"
    >
      <SvgIcon name="thinking" :size="14" />
      <span>规划</span>
    </button>

    <div class="paper-chat-input-toolbar__actions">
      <button
        class="paper-chat-input-toolbar__upload-button"
        :class="{ 'has-attachments': (props.totalAttachmentCount || 0) > 0 }"
        :disabled="props.isSending"
        :title="`上传文件 (文档: ${supportedDocumentLabel} / 图片: jpg, png, webp, bmp, tiff)`"
        @click="emit('upload')"
      >
        <SvgIcon name="attachment" :size="18" />
        <span
          v-if="(props.totalAttachmentCount || 0) > 0"
          class="paper-chat-input-toolbar__attachment-count"
        >
          {{ props.totalAttachmentCount }}
        </span>
      </button>

      <button
        v-if="!props.isSending"
        class="btn-primary paper-chat-input-toolbar__execute-button"
        :class="{
          'paper-chat-input-toolbar__execute-button--compact': props.variant === 'compact'
        }"
        title="执行"
        aria-label="执行"
        @click="emit('send')"
      >
        <SvgIcon v-if="props.variant === 'compact'" name="send" :size="17" />
        <template v-else>
          <span>执行</span>
        </template>
      </button>
      <button
        v-else
        class="btn-danger paper-chat-input-toolbar__stop-button"
        title="停止"
        aria-label="停止"
        @click="emit('stop')"
      >
        <SvgIcon name="stop" :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.paper-chat-input-toolbar {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-wrap: wrap;
}

.paper-chat-input-toolbar--compact {
  display: grid;
  grid-template-columns: auto auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sm-space-2);
}

.paper-chat-input-toolbar--compact .paper-chat-input-toolbar__model-selector {
  grid-column: 1 / -1;
  width: 100%;
}

.paper-chat-input-toolbar--compact .paper-chat-input-toolbar__model-button {
  width: 100%;
  justify-content: space-between;
  min-width: 0;
}

.paper-chat-input-toolbar--compact .paper-chat-input-toolbar__model-button span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paper-chat-input-toolbar--compact .paper-chat-input-toolbar__model-dropdown {
  width: 100%;
  min-width: 0;
}

.paper-chat-input-toolbar--compact .paper-chat-input-toolbar__actions {
  grid-column: 5;
  gap: var(--sm-space-2);
  margin-left: 0;
}

.paper-chat-input-toolbar--compact :deep(.paper-chat-mcp-tools-panel),
.paper-chat-input-toolbar--compact :deep(.paper-chat-knowledge-panel) {
  width: min(320px, calc(100vw - 48px));
  max-height: 420px;
}

.paper-chat-input-toolbar__model-selector {
  position: relative;
}

.paper-chat-input-toolbar__model-button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
}

.paper-chat-input-toolbar__model-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.paper-chat-input-toolbar__dropdown-arrow {
  font-size: 10px;
  color: var(--sm-color-text-tertiary);
  transition: transform var(--sm-transition-fast);
}

.paper-chat-input-toolbar__dropdown-arrow.open {
  transform: rotate(180deg);
}

.paper-chat-input-toolbar__model-dropdown {
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

.paper-chat-input-toolbar__model-option {
  padding: 9px 14px;
  font-size: 13px;
  color: var(--sm-color-text-primary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
  white-space: nowrap;
}

.paper-chat-input-toolbar__model-option:hover {
  background: var(--sm-color-surface-hover);
}

.paper-chat-input-toolbar__model-option.active {
  background: var(--sm-color-surface-selected);
  color: var(--sm-color-text-selected);
}

.paper-chat-input-toolbar__model-option.empty {
  color: var(--sm-color-text-tertiary);
  font-style: italic;
  cursor: default;
}

.paper-chat-input-toolbar__model-option.empty:hover {
  background-color: transparent;
}

.paper-chat-input-toolbar__actions {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  margin-left: auto;
}

.paper-chat-input-toolbar__upload-button {
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

.paper-chat-input-toolbar__upload-button:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.paper-chat-input-toolbar__upload-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.paper-chat-input-toolbar__upload-button.has-attachments {
  color: var(--sm-color-text-primary);
  border-color: var(--sm-color-border-selected);
  background: var(--sm-color-surface-selected);
}

.paper-chat-input-toolbar__attachment-count {
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

.paper-chat-input-toolbar__execute-button {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--sm-color-accent-12);
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-text-primary);
}

.paper-chat-input-toolbar__execute-button--compact {
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  gap: 0;
}

.paper-chat-input-toolbar__execute-button:hover {
  background: var(--sm-color-accent-18);
  border-color: var(--sm-color-accent-28);
}

.paper-chat-input-toolbar__stop-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 32px;
  height: 32px;
  padding: 0;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--sm-color-status-danger);
}

.paper-chat-input-toolbar__stop-button:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: var(--sm-color-status-danger);
}

.paper-chat-input-toolbar__plan-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.paper-chat-input-toolbar__plan-toggle:hover:not(:disabled) {
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.paper-chat-input-toolbar__plan-toggle.active {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-accent-12);
  color: var(--sm-color-accent-hover);
}

.paper-chat-input-toolbar__plan-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .paper-chat-input-toolbar__actions {
    margin-left: 0;
    width: 100%;
  }
}
</style>
