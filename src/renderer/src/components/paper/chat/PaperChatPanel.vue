<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue'
import PaperChatInput from '@renderer/components/paper/chat/PaperChatInput.vue'
import PaperChatPlanDock from '@renderer/components/paper/chat/PaperChatPlanDock.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import PaperChatMessageList from './PaperChatMessageList.vue'
import { usePaperChatSession } from './usePaperChatSession'
import { usePaperChatStream } from './usePaperChatStream'
import { useZustandStore } from '@renderer/composables/useZustandStore'
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
import styles from './PaperChatPanel.module.css'

const props = defineProps<{
  paper: PaperDocument
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const paperRef = computed(() => props.paper)
const dismissedQuickReplyIds = ref<Set<string>>(new Set())
const notify = useNotification()
const paperChatStreamStore = useZustandStore(usePaperChatStreamStore)

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
  paperId: computed(() => props.paper.id),
  messages,
  selectedModel,
  selectedMCPTools,
  selectedKnowledgeBases,
  enableLabTools,
  enablePaperWebSearch,
  saveCurrentSession,
  setError: (message) => {
    notify.error('论文对话', message, { source: 'chat' })
  }
})

const visibleMessages = computed(() =>
  messages.value.filter((message) => !message.hidden && message.role !== 'tool')
)

const currentPlanState = computed(() => {
  return sessionId.value ? paperChatStreamStore.getSessionPlanState(sessionId.value) : null
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

  const confirmed = await notify.confirm('聊天记录会被清空。', {
    title: '清空当前论文聊天上下文？',
    danger: true
  })
  if (!confirmed) {
    return
  }

  const cleared = await clearContext()
  if (cleared) {
    dismissedQuickReplyIds.value = new Set()
    if (sessionId.value) {
      paperChatStreamStore.resetPlanState(sessionId.value)
    }
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
  <section :class="styles['paper-chat-panel']">
    <header :class="styles['paper-chat-panel__header']">
      <div :class="styles['paper-chat-panel__title-group']">
        <h2>论文对话</h2>
        <span :title="props.paper.fileName">{{ props.paper.fileName }}</span>
      </div>

      <div :class="styles['paper-chat-panel__actions']">
        <button
          :class="styles['paper-chat-panel__icon-button']"
          type="button"
          title="清空上下文"
          aria-label="清空上下文"
          :disabled="loading || isSending"
          @click="handleClearContext"
        >
          <SvgIcon name="trash" :size="15" />
        </button>
        <button
          :class="styles['paper-chat-panel__icon-button']"
          type="button"
          title="关闭"
          aria-label="关闭"
          @click="emit('close')"
        >
          <SvgIcon name="close" :size="16" />
        </button>
      </div>
    </header>

    <div v-if="loading" :class="styles['paper-chat-panel__loading']">
      <SvgIcon name="spinner" :size="18" spin />
      <span>正在准备论文会话...</span>
    </div>

    <template v-else>
      <PaperChatMessageList
        :messages="messages"
        :is-sending="isSending"
        :current-model-name="selectedModel"
        :current-chat-id="sessionId"
      />

      <div :class="styles['paper-chat-panel__composer']">
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
