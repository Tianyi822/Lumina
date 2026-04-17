<script setup lang="ts">
import { computed, inject, ref, unref, watch, type ComputedRef, type Ref } from 'vue'
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
import { toAttachedDocuments, toAttachedImages } from './message-input/attachmentUtils'
import { isImageFile } from '@renderer/stores/imageUploadStore'
import type { KnowledgeBase, MCPTool } from '@renderer/types'
import { useChatStreamStore } from '@renderer/stores'
import type { AttachedDocument, AttachedImage } from '@shared/types/chat'
import type { MessageOptionContext, ParsedOption } from '@renderer/utils/optionParser'

type InjectedSessionId = string | Ref<string> | ComputedRef<string>

const props = defineProps<{
  isSending?: boolean
  inputMessage?: string
  selectedModel?: string
  selectedMCPTools?: MCPTool[]
  selectedKnowledgeBases?: KnowledgeBase[]
  enableSandboxTools?: boolean
  quickReplyInfo?: MessageOptionContext | null
  variant?: 'default' | 'compact'
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
  (e: 'quick-reply-selected', messageId: string): void
}>()

const sessionId = inject<InjectedSessionId>('sessionId', '')
const TEMP_SESSION_ID = 'temp'

const localInputMessage = ref(props.inputMessage ?? '')
const localSelectedModel = ref(props.selectedModel ?? '')
const localSelectedTools = ref<MCPTool[]>(props.selectedMCPTools ?? [])
const localSelectedKnowledgeBases = ref<KnowledgeBase[]>(props.selectedKnowledgeBases ?? [])
const localEnableSandboxTools = ref(props.enableSandboxTools ?? false)
const textareaRef = ref<InstanceType<typeof InputTextarea> | null>(null)
const showWarning = ref(false)
const warningTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

const effectiveSessionId = computed(() => unref(sessionId) || TEMP_SESSION_ID)
const { pendingDocs, processingFiles, uploadDocuments, removePendingDoc, clearPendingDocs } =
  useDocumentUpload(effectiveSessionId)
const { pendingImages, addImages, removePendingImage, clearPendingImages } =
  useImageUpload(effectiveSessionId)
const totalAttachmentCount = computed(() => pendingDocs.value.length + pendingImages.value.length)

const { modelOptions } = useConfiguredModels(localSelectedModel, updateSelectedModel)
const { isDragging, handleDragOver, handleDragLeave, handleDrop, triggerFileUpload } =
  useFileDragDrop({
    isSending: () => Boolean(props.isSending),
    uploadDocuments,
    addImages
  })

const chatStreamStore = useChatStreamStore()
const { showUserInteraction, userInteractionInfo } = storeToRefs(chatStreamStore)

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

/**
 * 从剪贴板中提取图片文件
 */
function extractClipboardImageFiles(event: ClipboardEvent): File[] {
  const clipboardData = event.clipboardData
  if (!clipboardData) {
    return []
  }

  const filesFromItems = Array.from(clipboardData.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)

  if (filesFromItems.length > 0) {
    return filesFromItems
  }

  return Array.from(clipboardData.files).filter(
    (file) => file.type.startsWith('image/') || isImageFile(file)
  )
}

async function handlePaste(event: ClipboardEvent): Promise<void> {
  const imageFiles = extractClipboardImageFiles(event)

  if (imageFiles.length === 0) {
    return
  }

  const hasPlainText = Boolean(event.clipboardData?.getData('text/plain').trim())

  if (!hasPlainText) {
    event.preventDefault()
  }

  if (props.isSending) {
    window.api.logger.warn('[MessageInput] 正在回复中，忽略粘贴图片', {
      imageCount: imageFiles.length
    })
    return
  }

  window.api.logger.info('[MessageInput] 检测到剪贴板图片', {
    imageCount: imageFiles.length
  })

  const errors = await addImages(imageFiles)

  if (errors.length > 0) {
    window.api.logger.warn('[MessageInput] 粘贴图片失败', {
      imageCount: imageFiles.length,
      errors
    })
    alert(errors.join('\n'))
  }
}

async function handleUserInteractionSelect(_value: string, label: string): Promise<void> {
  chatStreamStore.hideUserInteraction()

  sendMessage(`我选择：${label}`)
}
</script>

<template>
  <div
    class="message-input-container"
    :class="{ 'message-input-container--compact': props.variant === 'compact' }"
  >
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
          : '输入命令或消息，可拖拽文件或粘贴图片上传 ...'
      "
      @keydown="handleKeydown"
      @paste="handlePaste"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    />

    <div v-if="showWarning" class="warning-banner">
      <span class="warning-label">警告</span>
      <span>正在回复中，请稍候再发送...</span>
    </div>

    <ToolSelectionBar
      :is-sending="props.isSending"
      :variant="props.variant"
      :selected-model="localSelectedModel"
      :model-options="modelOptions"
      :selected-tools="localSelectedTools"
      :selected-knowledge-bases="localSelectedKnowledgeBases"
      :enable-sandbox-tools="localEnableSandboxTools"
      :total-attachment-count="totalAttachmentCount"
      @update:selected-model="updateSelectedModel"
      @update:selected-tools="updateSelectedTools"
      @update:selected-knowledge-bases="updateSelectedKnowledgeBases"
      @update:enable-sandbox-tools="updateEnableSandboxTools"
      @upload="triggerFileUpload"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>

<style scoped>
.message-input-container {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
  padding: var(--sm-space-5);
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
}

.message-input-container--compact {
  gap: var(--sm-space-2);
  padding: var(--sm-space-3);
  border-radius: var(--sm-radius-md);
}

.message-input-container--compact :deep(.message-textarea) {
  min-height: 86px;
  max-height: 168px;
  padding: 12px;
  resize: vertical;
}

.quick-reply-panel {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
  padding: 14px 16px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-accent-24);
  border-radius: var(--sm-radius-md);
}

.quick-reply-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quick-reply-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.quick-reply-custom-btn {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.quick-reply-custom-btn:hover:not(:disabled) {
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
  background: var(--sm-color-surface-hover);
}

.quick-reply-custom-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.voice-info-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--sm-color-accent-24);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-accent-08);
  color: var(--sm-color-text-primary);
  font-size: 12px;
}

.voice-info-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--sm-color-accent-16);
  color: var(--sm-color-accent-hover);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.warning-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: var(--sm-radius-sm);
  background: rgba(197, 161, 101, 0.08);
  color: var(--sm-color-text-primary);
  font-size: 12px;
}

.warning-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(197, 161, 101, 0.16);
  color: var(--sm-color-status-warning);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
</style>
