<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import UserInteractionOptions from './UserInteractionOptions.vue'
import ChatOptions from './chat/ChatOptions.vue'
import AttachedDocuments from './message-input/AttachedDocuments.vue'
import AttachedImages from './message-input/AttachedImages.vue'
import InputTextarea from './message-input/InputTextarea.vue'
import ProcessingFilesList from './message-input/ProcessingFilesList.vue'
import ToolSelectionBar from './message-input/ToolSelectionBar.vue'
import { useConfiguredModels } from './message-input/composables/useConfiguredModels'
import { useDocumentUpload } from './message-input/composables/useDocumentUpload'
import { useFileDragDrop } from './message-input/composables/useFileDragDrop'
import { useImageUpload } from './message-input/composables/useImageUpload'
import { useVoiceRecording } from './message-input/composables/useVoiceRecording'
import { toAttachedDocuments, toAttachedImages } from './message-input/attachmentUtils'
import type {
  ExportFormat,
  KnowledgeBase,
  MCPTool,
  SelectedPptTemplate,
  UserInteractionRequest
} from '@renderer/types'
import { useChatStreamStore, useInputStateStore, useSessionStore } from '@renderer/stores'
import type { AttachedDocument, AttachedImage } from '@shared/types/chat'
import type { MessageOptionContext, ParsedOption } from '@renderer/utils/optionParser'

const props = defineProps<{
  isSending?: boolean
  inputMessage?: string
  selectedModel?: string
  selectedMCPTools?: MCPTool[]
  selectedKnowledgeBases?: KnowledgeBase[]
  enableSandboxTools?: boolean
  exportInteractionInfo?: UserInteractionRequest | null
  quickReplyInfo?: MessageOptionContext | null
}>()

const emit = defineEmits<{
  (
    e: 'send',
    message: string,
    model: string,
    selectedMCPTools: MCPTool[],
    selectedKnowledgeBases: KnowledgeBase[],
    enableSandboxTools: boolean,
    attachedDocuments: AttachedDocument[],
    attachedImages: AttachedImage[]
  ): void
  (e: 'stop'): void
  (e: 'update:inputMessage', value: string): void
  (e: 'update:selectedModel', value: string): void
  (e: 'update:selectedMCPTools', value: MCPTool[]): void
  (e: 'update:selectedKnowledgeBases', value: KnowledgeBase[]): void
  (e: 'update:enableSandboxTools', value: boolean): void
  (e: 'select-export-format', format: ExportFormat): void
  (e: 'quick-reply-selected', messageId: string): void
}>()

const sessionId = inject<string>('sessionId', '')
const TEMP_SESSION_ID = 'temp'

const localInputMessage = ref(props.inputMessage ?? '')
const localSelectedModel = ref(props.selectedModel ?? '')
const localSelectedTools = ref<MCPTool[]>(props.selectedMCPTools ?? [])
const localSelectedKnowledgeBases = ref<KnowledgeBase[]>(props.selectedKnowledgeBases ?? [])
const localEnableSandboxTools = ref(props.enableSandboxTools ?? false)
const textareaRef = ref<InstanceType<typeof InputTextarea> | null>(null)
const showWarning = ref(false)
const warningTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

const effectiveSessionId = computed(() => sessionId || TEMP_SESSION_ID)
const { pendingDocs, processingFiles, uploadDocuments, removePendingDoc, clearPendingDocs } =
  useDocumentUpload(effectiveSessionId)
const { pendingImages, addImages, removePendingImage, clearPendingImages } =
  useImageUpload(effectiveSessionId)
const totalAttachmentCount = computed(() => pendingDocs.value.length + pendingImages.value.length)

const { modelOptions } = useConfiguredModels(localSelectedModel, updateSelectedModel)
const { voiceRecognitionEnabled, isRecording, voiceInfoMessage, toggleVoiceRecording } =
  useVoiceRecording(localInputMessage)
const { isDragging, handleDragOver, handleDragLeave, handleDrop, triggerFileUpload } =
  useFileDragDrop({
    isSending: () => Boolean(props.isSending),
    uploadDocuments,
    addImages
  })

const chatStreamStore = useChatStreamStore()
const { showUserInteraction, userInteractionInfo } = storeToRefs(chatStreamStore)
const inputStateStore = useInputStateStore()
const sessionStore = useSessionStore()

watch(
  () => props.inputMessage,
  (value) => {
    if (value !== undefined && value !== localInputMessage.value) {
      localInputMessage.value = value
    }
  },
  { immediate: true }
)

watch(localInputMessage, (value) => {
  if (value !== props.inputMessage) {
    emit('update:inputMessage', value)
  }
})

watch(
  () => props.selectedModel,
  (value) => {
    if (value !== undefined && value !== localSelectedModel.value) {
      localSelectedModel.value = value
    }
  },
  { immediate: true }
)

watch(
  () => props.selectedMCPTools,
  (value) => {
    if (value !== undefined && value !== localSelectedTools.value) {
      localSelectedTools.value = value
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => props.selectedKnowledgeBases,
  (value) => {
    if (value !== undefined && value !== localSelectedKnowledgeBases.value) {
      localSelectedKnowledgeBases.value = value
    }
  },
  { immediate: true, deep: true }
)

watch(
  () => props.enableSandboxTools,
  (value) => {
    if (value !== undefined && value !== localEnableSandboxTools.value) {
      localEnableSandboxTools.value = value
    }
  },
  { immediate: true }
)

function updateSelectedModel(value: string): void {
  localSelectedModel.value = value
  emit('update:selectedModel', value)
}

function updateSelectedTools(tools: MCPTool[]): void {
  localSelectedTools.value = tools
  emit('update:selectedMCPTools', tools)
}

function updateSelectedKnowledgeBases(kbs: KnowledgeBase[]): void {
  localSelectedKnowledgeBases.value = kbs
  emit('update:selectedKnowledgeBases', kbs)
}

function updateEnableSandboxTools(enabled: boolean): void {
  localEnableSandboxTools.value = enabled
  emit('update:enableSandboxTools', enabled)
  window.api.logger.debug('[MessageInput] 沙箱工具开关状态变更', { enabled })
}

function buildAttachedDocuments(): AttachedDocument[] {
  return toAttachedDocuments(pendingDocs.value)
}

function buildAttachedImages(): AttachedImage[] {
  return toAttachedImages(pendingImages.value)
}

function clearAttachments(): void {
  clearPendingDocs()
  clearPendingImages()
}

function sendMessage(message: string): void {
  emit(
    'send',
    message,
    localSelectedModel.value,
    localSelectedTools.value,
    localSelectedKnowledgeBases.value,
    localEnableSandboxTools.value,
    buildAttachedDocuments(),
    buildAttachedImages()
  )

  localInputMessage.value = ''
  emit('update:inputMessage', '')
  clearAttachments()
}

function handleSend(): void {
  const message = localInputMessage.value.trim()
  const hasAttachments = pendingDocs.value.length > 0 || pendingImages.value.length > 0

  if (props.isSending) {
    showWarning.value = true
    if (warningTimeout.value) clearTimeout(warningTimeout.value)
    warningTimeout.value = setTimeout(() => {
      showWarning.value = false
    }, 3000)
    return
  }

  if (!message && !hasAttachments) {
    return
  }

  window.api.logger.debug('[MessageInput] 发送消息，选中的工具', {
    count: localSelectedTools.value.length,
    sandboxToolsEnabled: localEnableSandboxTools.value,
    imageCount: pendingImages.value.length
  })

  sendMessage(message)
}

function handleQuickReplySelect(option: ParsedOption): void {
  if (props.isSending || !props.quickReplyInfo) {
    return
  }

  const replyText = option.label.trim()
  if (!replyText) {
    return
  }

  emit('quick-reply-selected', props.quickReplyInfo.messageId)

  window.api.logger.debug('[MessageInput] 发送快捷回复', {
    messageId: props.quickReplyInfo.messageId,
    optionId: option.id
  })

  sendMessage(replyText)
}

function focusCustomReply(): void {
  textareaRef.value?.focus()
}

function handleStop(): void {
  emit('stop')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    handleSend()
  }
}

async function handleUserInteractionSelect(value: string, label: string): Promise<void> {
  chatStreamStore.hideUserInteraction()

  if (userInteractionInfo.value?.interactionType === 'presentation_template') {
    const selectedTemplate: SelectedPptTemplate = { id: value, name: label }
    inputStateStore.updateSelectedPptTemplate(selectedTemplate)
    await sessionStore.persistCurrentSelectionState()

    sendMessage(`我选择了 PPT 模板「${label}」（templateId: ${value}）`)
    return
  }

  sendMessage(`我选择：${label}`)
}

function handleExportInteractionSelect(value: string): void {
  emit('select-export-format', value as ExportFormat)
}
</script>

<template>
  <div class="message-input-container">
    <UserInteractionOptions
      v-if="props.exportInteractionInfo"
      :interaction-info="props.exportInteractionInfo"
      @select="handleExportInteractionSelect"
    />

    <UserInteractionOptions
      v-if="showUserInteraction && userInteractionInfo"
      :interaction-info="userInteractionInfo"
      @select="handleUserInteractionSelect"
    />

    <div v-if="props.quickReplyInfo" class="quick-reply-panel">
      <div class="quick-reply-header">
        <span class="quick-reply-title">快捷选项</span>
        <button
          type="button"
          class="quick-reply-custom-btn"
          :disabled="props.isSending"
          @click="focusCustomReply"
        >
          自定义回答
        </button>
      </div>

      <ChatOptions
        :options="props.quickReplyInfo.options"
        :disabled="props.isSending"
        @select="handleQuickReplySelect"
      />
    </div>

    <AttachedDocuments
      :documents="pendingDocs"
      :disabled="props.isSending"
      @remove="removePendingDoc"
    />
    <AttachedImages
      :images="pendingImages"
      :disabled="props.isSending"
      @remove="removePendingImage"
    />
    <ProcessingFilesList :files="processingFiles" />

    <InputTextarea
      ref="textareaRef"
      v-model="localInputMessage"
      :is-sending="props.isSending"
      :is-dragging="isDragging"
      :has-attachments="totalAttachmentCount > 0"
      :placeholder="
        props.quickReplyInfo
          ? '输入自定义回答，或点击上方快捷选项 ...'
          : '输入命令或消息，可拖拽文件或图片上传 ...'
      "
      @keydown="handleKeydown"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    />

    <div v-if="voiceInfoMessage" class="voice-info-banner">
      <span class="voice-info-label">INFO</span>
      <span>{{ voiceInfoMessage }}</span>
    </div>

    <div v-if="showWarning" class="warning-banner">
      <span class="warning-label">警告</span>
      <span>正在回复中，请稍候再发送...</span>
    </div>

    <ToolSelectionBar
      :is-sending="props.isSending"
      :selected-model="localSelectedModel"
      :model-options="modelOptions"
      :selected-tools="localSelectedTools"
      :selected-knowledge-bases="localSelectedKnowledgeBases"
      :enable-sandbox-tools="localEnableSandboxTools"
      :total-attachment-count="totalAttachmentCount"
      :voice-recognition-enabled="voiceRecognitionEnabled"
      :is-recording="isRecording"
      @update:selected-model="updateSelectedModel"
      @update:selected-tools="updateSelectedTools"
      @update:selected-knowledge-bases="updateSelectedKnowledgeBases"
      @update:enable-sandbox-tools="updateEnableSandboxTools"
      @upload="triggerFileUpload"
      @toggle-voice="toggleVoiceRecording"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>

<style scoped>
.message-input-container {
  padding: 16px 24px 20px;
  background:
    linear-gradient(
      180deg,
      transparent 0%,
      var(--glass-white-013, rgba(255, 255, 255, 0.013)) 100%
    ),
    var(--theme-bg);
  border-top: 1px solid var(--theme-border);
}

.quick-reply-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
  padding: 14px 16px;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent) 6%, transparent) 0%,
      var(--theme-bg-secondary) 100%
    ),
    var(--theme-bg-secondary);
  border: 1px solid color-mix(in srgb, var(--theme-accent) 20%, var(--theme-border));
  border-radius: calc(var(--theme-radius) + 2px);
}

.quick-reply-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quick-reply-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--theme-text);
}

.quick-reply-custom-btn {
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 25%, var(--theme-border));
  border-radius: 999px;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    color 0.16s ease,
    background-color 0.16s ease;
}

.quick-reply-custom-btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--theme-accent) 45%, var(--theme-border));
  color: var(--theme-text);
  background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
}

.quick-reply-custom-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.voice-info-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: var(--theme-radius-sm, 6px);
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.12) 0%, rgba(14, 165, 233, 0.05) 100%);
  color: var(--theme-text);
  font-size: 12px;
}

.voice-info-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.18);
  color: #0369a1;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: var(--theme-radius-sm, 6px);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.05) 100%);
  color: var(--theme-text);
  font-size: 12px;
  animation: shake 0.4s ease-in-out;
}

.warning-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.18);
  color: #b45309;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
</style>
