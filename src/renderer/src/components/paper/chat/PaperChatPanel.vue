<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue'
import PaperChatInput from '@renderer/components/paper/chat/PaperChatInput.vue'
import PaperChatPlanDock from '@renderer/components/paper/chat/PaperChatPlanDock.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import PaperChatMessageList from './PaperChatMessageList.vue'
import { usePaperChatSession } from './usePaperChatSession'
import { usePaperChatStream } from './usePaperChatStream'
import { usePaperChatStreamStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { parseMessageOptions, type MessageOptionContext } from '@renderer/utils/optionParser'
import type {
  AttachedDocument,
  AttachedImage,
  KnowledgeBase,
  MCPTool,
  Message
} from '@renderer/types'
import type { PaperDocument } from '@shared/types/paper'
import type { PaperQuote } from '@shared/types/chat'

const props = defineProps<{
  paper: PaperDocument
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const paperRef = computed(() => props.paper)
const dismissedQuickReplyIds = ref<Set<string>>(new Set())
const notify = useNotification()
const paperChatStreamStore = usePaperChatStreamStore()

const {
  session,
  sessionId,
  messages,
  inputMessage,
  selectedModel,
  selectedMCPTools,
  selectedKnowledgeBases,
  enableLabTools,
  enablePaperWebSearch,
  loading,
  contextLoading,
  ensurePaperContextLoaded,
  loadSessionWithContext,
  saveCurrentSession,
  clearContext,
  updateInputMessage,
  updateSelectedModel,
  updateSelectedTools,
  updateSelectedKnowledgeBases,
  updateEnableLabTools,
  updateEnablePaperWebSearch
} = usePaperChatSession(paperRef)

provide('sessionId', sessionId)

const { isSending, sendMessage, stopRequest } = usePaperChatStream({
  session,
  messages,
  selectedModel,
  selectedMCPTools,
  selectedKnowledgeBases,
  enableLabTools,
  enablePaperWebSearch,
  ensurePaperContextLoaded,
  saveCurrentSession,
  setError: (message) => {
    notify.error('论文对话', message, { source: 'chat' })
  }
})

const visibleMessages = computed(() =>
  messages.value.filter((message) => !message.hidden && message.role !== 'tool')
)

const currentPlanState = computed(() => {
  return sessionId.value ? (paperChatStreamStore.planStates.get(sessionId.value) ?? null) : null
})

const activeQuickReply = computed<MessageOptionContext | null>(() => {
  for (let index = visibleMessages.value.length - 1; index >= 0; index -= 1) {
    const message = visibleMessages.value[index]

    if (message.role === 'user') {
      return null
    }

    if (message.role !== 'assistant' || message.isStreaming) {
      continue
    }

    if (dismissedQuickReplyIds.value.has(message.id)) {
      return null
    }

    const parsedFromContent = parseMessageOptions(message.content)
    if (parsedFromContent.hasOptions) {
      return {
        messageId: message.id,
        ...parsedFromContent
      }
    }

    const parsedFromReasoning = parseMessageOptions(message.reasoning || '')
    if (parsedFromReasoning.hasOptions) {
      return {
        messageId: message.id,
        ...parsedFromReasoning
      }
    }

    return null
  }

  return null
})

watch(
  () => props.paper.id,
  async () => {
    dismissedQuickReplyIds.value = new Set()
    await loadSessionWithContext()
  },
  { immediate: true }
)

watch(
  () => visibleMessages.value.map((message: Message) => message.id),
  (messageIds) => {
    const validMessageIds = new Set(messageIds)
    const nextDismissedIds = new Set(
      [...dismissedQuickReplyIds.value].filter((messageId) => validMessageIds.has(messageId))
    )

    if (nextDismissedIds.size !== dismissedQuickReplyIds.value.size) {
      dismissedQuickReplyIds.value = nextDismissedIds
    }
  },
  { flush: 'post' }
)

async function handleSend(
  message: string,
  model: string,
  selectedTools: MCPTool[],
  selectedKnowledgeBases: KnowledgeBase[],
  labToolsEnabled: boolean,
  attachedDocuments: AttachedDocument[],
  attachedImages: AttachedImage[],
  attachedQuotes: PaperQuote[]
): Promise<void> {
  updateSelectedModel(model)
  updateSelectedTools(selectedTools)
  updateSelectedKnowledgeBases(selectedKnowledgeBases)
  updateEnableLabTools(labToolsEnabled)
  await sendMessage(message, attachedDocuments, attachedImages, attachedQuotes)
}

async function handleClearContext(): Promise<void> {
  if (isSending.value) {
    notify.warning('论文对话', '正在回复中，停止后再清空上下文', { source: 'chat' })
    return
  }

  const confirmed = await notify.confirm('聊天记录和隐藏全文上下文都会被清空。', {
    title: '清空当前论文聊天上下文？',
    danger: true
  })
  if (!confirmed) {
    return
  }

  const cleared = await clearContext()
  if (cleared) {
    dismissedQuickReplyIds.value = new Set()
  }
}

function handleQuickReplySelected(messageId: string): void {
  dismissedQuickReplyIds.value = new Set(dismissedQuickReplyIds.value).add(messageId)
}

async function handleEnablePaperWebSearch(value: boolean): Promise<void> {
  if (value) {
    try {
      const envInfo = await window.api.paperWebSearch.checkEnvironment()
      if (!envInfo.available) {
        notify.warning(
          '联网搜索不可用',
          envInfo.error || 'Electron 搜索运行时不可用，请重启应用后重试。',
          { source: 'chat' }
        )
        return
      }
    } catch {
      notify.warning('联网搜索不可用', '环境检查失败，请稍后重试。', { source: 'chat' })
      return
    }
  }
  updateEnablePaperWebSearch(value)
}
</script>

<template>
  <section class="paper-chat-panel">
    <header class="paper-chat-panel__header">
      <div class="paper-chat-panel__title-group">
        <h2>论文对话</h2>
        <span :title="props.paper.fileName">{{ props.paper.fileName }}</span>
      </div>

      <div class="paper-chat-panel__actions">
        <button
          class="paper-chat-panel__icon-button"
          type="button"
          title="清空上下文"
          aria-label="清空上下文"
          :disabled="loading || isSending"
          @click="handleClearContext"
        >
          <SvgIcon name="trash" :size="15" />
        </button>
        <button
          class="paper-chat-panel__icon-button"
          type="button"
          title="关闭"
          aria-label="关闭"
          @click="emit('close')"
        >
          <SvgIcon name="close" :size="16" />
        </button>
      </div>
    </header>

    <div v-if="loading" class="paper-chat-panel__loading">
      <SvgIcon name="spinner" :size="18" spin />
      <span>正在准备论文会话...</span>
    </div>

    <template v-else>
      <div v-if="contextLoading" class="paper-chat-panel__context-status">
        <SvgIcon name="spinner" :size="14" spin />
        <span>正在加载论文全文上下文...</span>
      </div>

      <PaperChatMessageList
        :messages="messages"
        :is-sending="isSending"
        :current-model-name="selectedModel"
        :current-chat-id="sessionId"
      />

      <div class="paper-chat-panel__composer">
        <PaperChatPlanDock :plan-state="currentPlanState" />
        <PaperChatInput
          :key="sessionId || props.paper.id"
          variant="compact"
          :is-sending="isSending"
          :input-message="inputMessage"
          :selected-model="selectedModel"
          :selected-m-c-p-tools="selectedMCPTools"
          :selected-knowledge-bases="selectedKnowledgeBases"
          :enable-lab-tools="enableLabTools"
          :enable-paper-web-search="enablePaperWebSearch"
          :quick-reply-info="activeQuickReply"
          @send="handleSend"
          @stop="stopRequest"
          @quick-reply-selected="handleQuickReplySelected"
          @update:input-message="updateInputMessage"
          @update:selected-model="updateSelectedModel"
          @update:selected-m-c-p-tools="updateSelectedTools"
          @update:selected-knowledge-bases="updateSelectedKnowledgeBases"
          @update:enable-lab-tools="updateEnableLabTools"
          @update:enable-paper-web-search="handleEnablePaperWebSearch"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.paper-chat-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--sm-color-bg-canvas);
  color: var(--sm-color-text-primary);
}

.paper-chat-panel__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  min-height: 56px;
  padding: 0 var(--sm-space-4);
  border-bottom: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
}

.paper-chat-panel__title-group {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.paper-chat-panel__title-group h2 {
  margin: 0;
  color: var(--sm-color-text-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.paper-chat-panel__title-group span {
  overflow: hidden;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paper-chat-panel__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
}

.paper-chat-panel__icon-button {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.paper-chat-panel__icon-button:hover:not(:disabled) {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-primary);
}

.paper-chat-panel__icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.paper-chat-panel__context-status,
.paper-chat-panel__loading {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  padding: var(--sm-space-3) var(--sm-space-4);
  border-bottom: 1px solid var(--sm-color-border-subtle);
  color: var(--sm-color-text-secondary);
  font-size: 12px;
}

.paper-chat-panel__loading {
  flex: 1;
  justify-content: center;
  border-bottom: 0;
}

.paper-chat-panel__composer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
  padding: var(--sm-space-3);
  border-top: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
}

.paper-chat-panel__composer :deep(.paper-chat-input) {
  border: 0;
  background: var(--sm-color-surface-2);
}
</style>
