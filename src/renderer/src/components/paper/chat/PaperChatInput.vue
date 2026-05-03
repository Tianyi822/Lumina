<script setup lang="ts">
import { computed, inject, ref, unref, watch, type ComputedRef, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import PaperChatInteractionOptions from './input/PaperChatInteractionOptions.vue'
import PaperChatOptions from './input/PaperChatOptions.vue'
import PaperChatAttachedDocuments from './input/PaperChatAttachedDocuments.vue'
import PaperChatAttachedImages from './input/PaperChatAttachedImages.vue'
import PaperChatAttachedQuotes from './input/PaperChatAttachedQuotes.vue'
import PaperChatTextarea from './input/PaperChatTextarea.vue'
import PaperChatProcessingFiles from './input/PaperChatProcessingFiles.vue'
import PaperChatToolSelectionBar from './input/PaperChatToolSelectionBar.vue'
import { usePaperChatConfiguredModels } from './input/usePaperChatConfiguredModels'
import { usePaperChatDocumentUpload } from './input/usePaperChatDocumentUpload'
import { usePaperChatFileDragDrop } from './input/usePaperChatFileDragDrop'
import { usePaperChatImageUpload } from './input/usePaperChatImageUpload'
import { toPaperChatAttachedDocuments, toPaperChatAttachedImages } from './input/attachmentUtils'
import { isImageFile } from '@renderer/stores/paperChatImageUploadStore'
import { usePaperChatQuoteStore } from '@renderer/stores/paperChatQuoteStore'
import type { KnowledgeBase, MCPTool } from '@renderer/types'
import { useNotification } from '@renderer/composables/useNotification'
import { usePaperChatStreamStore } from '@renderer/stores'
import type { AttachedDocument, AttachedImage, PaperQuote } from '@shared/types/chat'
import type { MessageOptionContext, ParsedOption } from '@renderer/utils/optionParser'

type InjectedSessionId = string | Ref<string> | ComputedRef<string>

const props = defineProps<{
  isSending?: boolean
  inputMessage?: string
  selectedModel?: string
  selectedMCPTools?: MCPTool[]
  selectedKnowledgeBases?: KnowledgeBase[]
  enableLabTools?: boolean
  enablePlanMode?: boolean
  enablePaperWebSearch?: boolean
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
    enableLabTools: boolean,
    attachedDocuments: AttachedDocument[],
    attachedImages: AttachedImage[],
    attachedQuotes: PaperQuote[]
  ): void
  (e: 'stop'): void
  (e: 'update:inputMessage', value: string): void
  (e: 'update:selectedModel', value: string): void
  (e: 'update:selectedMCPTools', value: MCPTool[]): void
  (e: 'update:selectedKnowledgeBases', value: KnowledgeBase[]): void
  (e: 'update:enableLabTools', value: boolean): void
  (e: 'update:enablePlanMode', value: boolean): void
  (e: 'update:enablePaperWebSearch', value: boolean): void
  (e: 'quick-reply-selected', messageId: string): void
}>()

const sessionId = inject<InjectedSessionId>('sessionId', '')
const TEMP_SESSION_ID = 'temp'

const localInputMessage = ref(props.inputMessage ?? '')
const localSelectedModel = ref(props.selectedModel ?? '')
const localSelectedTools = ref<MCPTool[]>(props.selectedMCPTools ?? [])
const localSelectedKnowledgeBases = ref<KnowledgeBase[]>(props.selectedKnowledgeBases ?? [])
const localEnableLabTools = ref(props.enableLabTools ?? false)
const localEnablePlanMode = ref(props.enablePlanMode ?? false)
const localEnablePaperWebSearch = ref(props.enablePaperWebSearch ?? false)
const textareaRef = ref<InstanceType<typeof PaperChatTextarea> | null>(null)
const notify = useNotification()

const effectiveSessionId = computed(() => unref(sessionId) || TEMP_SESSION_ID)
const { pendingDocs, processingFiles, uploadDocuments, removePendingDoc, clearPendingDocs } =
  usePaperChatDocumentUpload(effectiveSessionId)
const { pendingImages, addImages, removePendingImage, clearPendingImages } =
  usePaperChatImageUpload(effectiveSessionId)
const paperChatQuoteStore = usePaperChatQuoteStore()
const pendingQuotes = computed(() => paperChatQuoteStore.getSessionQuotes(effectiveSessionId.value))
const totalAttachmentCount = computed(
  () => pendingDocs.value.length + pendingImages.value.length + pendingQuotes.value.length
)

const { modelOptions } = usePaperChatConfiguredModels(localSelectedModel, updateSelectedModel)
const { isDragging, handleDragOver, handleDragLeave, handleDrop, triggerFileUpload } =
  usePaperChatFileDragDrop({
    isSending: () => Boolean(props.isSending),
    uploadDocuments,
    addImages
  })

const paperChatStreamStore = usePaperChatStreamStore()
const { showUserInteraction, userInteractionInfo } = storeToRefs(paperChatStreamStore)

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
  () => props.enableLabTools,
  (value) => {
    if (value !== undefined && value !== localEnableLabTools.value) {
      localEnableLabTools.value = value
    }
  },
  { immediate: true }
)

watch(
  () => props.enablePlanMode,
  (value) => {
    if (value !== undefined && value !== localEnablePlanMode.value) {
      localEnablePlanMode.value = value
    }
  },
  { immediate: true }
)

watch(
  () => props.enablePaperWebSearch,
  (value) => {
    if (value !== undefined && value !== localEnablePaperWebSearch.value) {
      localEnablePaperWebSearch.value = value
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

function updateEnableLabTools(enabled: boolean): void {
  localEnableLabTools.value = enabled
  emit('update:enableLabTools', enabled)
  window.api.logger.debug('[PaperChatInput] 实验室工具开关状态变更', { enabled })
}

function updateEnablePlanMode(enabled: boolean): void {
  localEnablePlanMode.value = enabled
  emit('update:enablePlanMode', enabled)
}

function updateEnablePaperWebSearch(enabled: boolean): void {
  localEnablePaperWebSearch.value = enabled
  emit('update:enablePaperWebSearch', enabled)
}

function buildPaperChatAttachedDocuments(): AttachedDocument[] {
  return toPaperChatAttachedDocuments(pendingDocs.value)
}

function buildPaperChatAttachedImages(): AttachedImage[] {
  return toPaperChatAttachedImages(pendingImages.value)
}

function buildPaperChatAttachedQuotes(): PaperQuote[] {
  return paperChatQuoteStore.getPendingQuotesForSending(effectiveSessionId.value)
}

function clearAttachments(): void {
  clearPendingDocs()
  clearPendingImages()
  paperChatQuoteStore.clearQuotes(effectiveSessionId.value)
}

function sendMessage(message: string): void {
  emit(
    'send',
    message,
    localSelectedModel.value,
    localSelectedTools.value,
    localSelectedKnowledgeBases.value,
    localEnableLabTools.value,
    buildPaperChatAttachedDocuments(),
    buildPaperChatAttachedImages(),
    buildPaperChatAttachedQuotes()
  )

  localInputMessage.value = ''
  emit('update:inputMessage', '')
  clearAttachments()
}

function handleSend(): void {
  const message = localInputMessage.value.trim()
  const hasAttachments =
    pendingDocs.value.length > 0 || pendingImages.value.length > 0 || pendingQuotes.value.length > 0

  if (props.isSending) {
    notify.warning('论文对话', '正在回复中，请稍候再发送...', { source: 'chat' })
    return
  }

  if (!message && !hasAttachments) {
    return
  }

  window.api.logger.debug('[PaperChatInput] 发送消息，选中的工具', {
    count: localSelectedTools.value.length,
    labToolsEnabled: localEnableLabTools.value,
    imageCount: pendingImages.value.length,
    quoteCount: pendingQuotes.value.length
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

  window.api.logger.debug('[PaperChatInput] 发送快捷回复', {
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
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) {
    return
  }

  if (event.shiftKey) {
    return
  }

  event.preventDefault()
  handleSend()
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
    window.api.logger.warn('[PaperChatInput] 正在回复中，忽略粘贴图片', {
      imageCount: imageFiles.length
    })
    return
  }

  window.api.logger.info('[PaperChatInput] 检测到剪贴板图片', {
    imageCount: imageFiles.length
  })

  const errors = await addImages(imageFiles)

  if (errors.length > 0) {
    window.api.logger.warn('[PaperChatInput] 粘贴图片失败', {
      imageCount: imageFiles.length,
      errors
    })
    notify.error('粘贴图片失败', errors.join('\n'), { source: 'chat' })
  }
}

async function handleUserInteractionSelect(_value: string, label: string): Promise<void> {
  paperChatStreamStore.hideUserInteraction()

  sendMessage(`我选择：${label}`)
}
</script>

<template>
  <div
    class="paper-chat-input"
    :class="{ 'paper-chat-input--compact': props.variant === 'compact' }"
  >
    <PaperChatInteractionOptions
      v-if="showUserInteraction && userInteractionInfo"
      :interaction-info="userInteractionInfo"
      @select="handleUserInteractionSelect"
    />

    <div v-if="props.quickReplyInfo" class="paper-chat-input__quick-reply">
      <div class="paper-chat-input__quick-reply-header">
        <span class="paper-chat-input__quick-reply-title">快捷选项</span>
        <button
          type="button"
          class="paper-chat-input__quick-reply-custom-button"
          :disabled="props.isSending"
          @click="focusCustomReply"
        >
          自定义回答
        </button>
      </div>

      <PaperChatOptions
        :options="props.quickReplyInfo.options"
        :disabled="props.isSending"
        @select="handleQuickReplySelect"
      />
    </div>

    <PaperChatAttachedDocuments
      :documents="pendingDocs"
      :disabled="props.isSending"
      @remove="removePendingDoc"
    />
    <PaperChatAttachedImages
      :images="pendingImages"
      :disabled="props.isSending"
      @remove="removePendingImage"
    />
    <PaperChatAttachedQuotes
      :quotes="pendingQuotes"
      :disabled="props.isSending"
      @remove="(id) => paperChatQuoteStore.removeQuote(effectiveSessionId, id)"
    />
    <PaperChatProcessingFiles :files="processingFiles" />

    <PaperChatTextarea
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

    <PaperChatToolSelectionBar
      :is-sending="props.isSending"
      :variant="props.variant"
      :selected-model="localSelectedModel"
      :model-options="modelOptions"
      :selected-tools="localSelectedTools"
      :selected-knowledge-bases="localSelectedKnowledgeBases"
      :enable-lab-tools="localEnableLabTools"
      :enable-plan-mode="localEnablePlanMode"
      :enable-paper-web-search="localEnablePaperWebSearch"
      :total-attachment-count="totalAttachmentCount"
      @update:selected-model="updateSelectedModel"
      @update:selected-tools="updateSelectedTools"
      @update:selected-knowledge-bases="updateSelectedKnowledgeBases"
      @update:enable-lab-tools="updateEnableLabTools"
      @update:enable-plan-mode="updateEnablePlanMode"
      @update:enable-paper-web-search="updateEnablePaperWebSearch"
      @upload="triggerFileUpload"
      @send="handleSend"
      @stop="handleStop"
    />
  </div>
</template>

<style scoped>
.paper-chat-input {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
  padding: var(--sm-space-5);
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
}

.paper-chat-input--compact {
  gap: var(--sm-space-2);
  padding: var(--sm-space-3);
  border-radius: var(--sm-radius-md);
}

.paper-chat-input--compact :deep(.paper-chat-input__textarea) {
  min-height: 86px;
  max-height: 168px;
  padding: 12px;
  resize: vertical;
}

.paper-chat-input__quick-reply {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
  padding: 14px 16px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-accent-24);
  border-radius: var(--sm-radius-md);
}

.paper-chat-input__quick-reply-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.paper-chat-input__quick-reply-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-chat-input__quick-reply-custom-button {
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

.paper-chat-input__quick-reply-custom-button:hover:not(:disabled) {
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
  background: var(--sm-color-surface-hover);
}

.paper-chat-input__quick-reply-custom-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.paper-chat-input__warning {
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

.paper-chat-input__warning-label {
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
