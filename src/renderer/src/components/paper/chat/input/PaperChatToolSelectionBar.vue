<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { KnowledgeBase, MCPTool } from '@renderer/types'
import PaperChatMcpToolsPanel from '@renderer/components/paper/chat/input/PaperChatMcpToolsPanel.vue'
import PaperChatKnowledgeBasePanel from '@renderer/components/paper/chat/input/PaperChatKnowledgeBasePanel.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import LabToolsToggle from '@renderer/components/lab/LabToolsToggle.vue'
import { SUPPORTED_DOC_TYPES } from './attachmentUtils'
import styles from './PaperChatToolSelectionBar.module.css'

const props = defineProps<{
  isSending?: boolean
  selectedModel?: string
  modelOptions: string[]
  selectedTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableLabTools?: boolean
  enablePaperWebSearch?: boolean
  totalAttachmentCount?: number
  variant?: 'default' | 'compact'
}>()

const emit = defineEmits<{
  (e: 'update:selectedModel', value: string): void
  (e: 'update:selectedTools', value: MCPTool[]): void
  (e: 'update:selectedKnowledgeBases', value: KnowledgeBase[]): void
  (e: 'update:enableLabTools', value: boolean): void
  (e: 'update:enablePaperWebSearch', value: boolean): void
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
    :class="styles['paper-chat-input-toolbar']"
    :class="{ [styles['paper-chat-input-toolbar--compact']]: props.variant === 'compact' }"
  >
    <div ref="modelSelectorRef" :class="styles['paper-chat-input-toolbar__model-selector']">
      <button
        :class="['btn', styles['paper-chat-input-toolbar__model-button']]"
        :disabled="props.isSending"
        @click="toggleModelDropdown"
      >
        <span>{{ props.selectedModel || '选择模型' }}</span>
        <span class="paper-chat-input-toolbar__dropdown-arrow" :class="{ open: showModelDropdown }"
          >▼</span
        >
      </button>
      <div v-if="showModelDropdown" :class="styles['paper-chat-input-toolbar__model-dropdown']">
        <div
          v-if="props.modelOptions.length === 0"
          :class="[styles['paper-chat-input-toolbar__model-option'], 'empty']"
        >
          暂无模型配置
        </div>
        <div
          v-for="model in props.modelOptions"
          :key="model"
          :class="styles['paper-chat-input-toolbar__model-option']"
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

    <button
      type="button"
      :class="styles['paper-chat-input-toolbar__search-toggle']"
      :class="{
        enabled: props.enablePaperWebSearch,
        disabled: props.isSending,
        'is-compact': props.variant === 'compact'
      }"
      :disabled="props.isSending"
      :aria-pressed="props.enablePaperWebSearch ? 'true' : 'false'"
      title="联网搜索：允许模型在需要时搜索学术资料补充论文信息"
      @click="emit('update:enablePaperWebSearch', !props.enablePaperWebSearch)"
    >
      <span class="toggle-switch" aria-hidden="true">
        <span class="toggle-thumb"></span>
      </span>
      <span class="toggle-label">搜索</span>
    </button>

    <LabToolsToggle
      :compact="props.variant === 'compact'"
      :model-value="props.enableLabTools"
      :disabled="props.isSending"
      @update:model-value="emit('update:enableLabTools', $event)"
      @change="emit('update:enableLabTools', $event)"
    />

    <div :class="styles['paper-chat-input-toolbar__actions']">
      <button
        :class="styles['paper-chat-input-toolbar__upload-button']"
        :class="{ 'has-attachments': (props.totalAttachmentCount || 0) > 0 }"
        :disabled="props.isSending"
        :title="`上传文件 (文档: ${supportedDocumentLabel} / 图片: jpg, png, webp, bmp, tiff)`"
        @click="emit('upload')"
      >
        <SvgIcon name="attachment" :size="18" />
        <span
          v-if="(props.totalAttachmentCount || 0) > 0"
          :class="styles['paper-chat-input-toolbar__attachment-count']"
        >
          {{ props.totalAttachmentCount }}
        </span>
      </button>

      <button
        v-if="!props.isSending"
        :class="['btn-primary', styles['paper-chat-input-toolbar__execute-button']]"
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
        :class="['btn-danger', styles['paper-chat-input-toolbar__stop-button']]"
        title="停止"
        aria-label="停止"
        @click="emit('stop')"
      >
        <SvgIcon name="stop" :size="18" />
      </button>
    </div>
  </div>
</template>
