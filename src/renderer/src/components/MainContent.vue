<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, provide, computed } from 'vue'
import ChatMessage from './chat/ChatMessage.vue'
import MessageInput from './MessageInput.vue'
import ReActSteps from './ReActSteps.vue'
import type {
  Message,
  MCPTool,
  KnowledgeBase,
  ExportFormat,
  UserInteractionRequest,
  AttachedDocument,
  AttachedImage
} from '@renderer/types'
import type { MessageOptionContext } from '@renderer/utils/optionParser'
import { parseMessageOptions } from '@renderer/utils/optionParser'

const props = defineProps<{
  currentChatId?: string
  messages?: Message[]
  isSending?: boolean
  currentModelName?: string
  configUpdateKey?: number
  inputMessage?: string
  selectedModel?: string
  selectedMCPTools?: MCPTool[]
  selectedKnowledgeBases?: KnowledgeBase[]
  enableSandboxTools?: boolean
  sessionId?: string
  exportInteractionInfo?: UserInteractionRequest | null
  exportingMessageId?: string | null
}>()

// 提供 sessionId 给子组件
provide(
  'sessionId',
  computed(() => props.sessionId || '')
)

const emit = defineEmits<{
  (
    e: 'send-message',
    message: string,
    model: string,
    selectedTools: MCPTool[],
    selectedKnowledgeBases: KnowledgeBase[],
    enableSandboxTools: boolean,
    attachedDocuments: AttachedDocument[],
    attachedImages: AttachedImage[]
  ): void
  (e: 'stop-request'): void
  (e: 'update:inputMessage', value: string): void
  (e: 'update:selectedModel', value: string): void
  (e: 'update:selectedMCPTools', value: MCPTool[]): void
  (e: 'update:selectedKnowledgeBases', value: KnowledgeBase[]): void
  (e: 'update:enableSandboxTools', value: boolean): void
  (e: 'request-export', message: Message): void
  (e: 'select-export-format', format: ExportFormat): void
}>()

// 展开的思考内容消息ID集合
const expandedReasoningIds = ref<Set<string>>(new Set())

// 已关闭的快捷回复消息 ID
const dismissedQuickReplyIds = ref<Set<string>>(new Set())

// 消息区域引用
const messagesAreaRef = ref<HTMLElement | null>(null)

// 用户是否正在手动滚动（不在底部）
const userScrolling = ref(false)

// 记录上一次滚动位置，用于判断滚动方向
const lastScrollTop = ref(0)

// 滚动阈值：距离底部多少像素内认为是"在底部"
const SCROLL_THRESHOLD = 100

let scrollFrameId: number | null = null
let pendingScrollSmooth = true

/**
 * 检查是否滚动到底部附近
 */
function isNearBottom(): boolean {
  const el = messagesAreaRef.value
  if (!el) return true
  const { scrollTop, scrollHeight, clientHeight } = el
  return scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD
}

/**
 * 滚动到底部
 */
function scrollToBottom(smooth = true): void {
  const el = messagesAreaRef.value
  if (!el) return
  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  })
}

/**
 * 合并连续滚动请求，避免流式阶段频繁触发滚动抖动
 */
function scheduleScrollToBottom(smooth = true): void {
  pendingScrollSmooth = pendingScrollSmooth && smooth

  if (scrollFrameId !== null) {
    return
  }

  scrollFrameId = window.requestAnimationFrame(() => {
    const shouldSmooth = pendingScrollSmooth
    pendingScrollSmooth = true
    scrollFrameId = null
    scrollToBottom(shouldSmooth)
  })
}

/**
 * 清理待执行的滚动任务
 */
function cancelScheduledScroll(): void {
  if (scrollFrameId !== null) {
    window.cancelAnimationFrame(scrollFrameId)
    scrollFrameId = null
  }
  pendingScrollSmooth = true
}

/**
 * 处理滚动事件
 */
function handleScroll(): void {
  const el = messagesAreaRef.value
  if (!el) return

  const currentScrollTop = el.scrollTop

  if (isNearBottom()) {
    userScrolling.value = false
  } else if (currentScrollTop < lastScrollTop.value) {
    // 用户一旦开始向上滚动，立即暂停自动跟底，避免流式输出时抖动
    userScrolling.value = true
  }

  lastScrollTop.value = currentScrollTop
}

/**
 * 处理滚轮事件
 */
function handleWheel(event: WheelEvent): void {
  if (event.deltaY < 0) {
    userScrolling.value = true
  }
}

/**
 * 智能滚动：仅在用户位于底部附近时自动滚动
 */
function smartScrollToBottom(): void {
  if (!userScrolling.value) {
    scheduleScrollToBottom(!props.isSending)
  }
}

// 监听消息变化，智能滚动
watch(
  () => props.messages,
  () => {
    smartScrollToBottom()
  },
  { deep: true, flush: 'post' }
)

// 监听流式输出状态，开始时滚动到底部
watch(
  () => props.isSending,
  (sending) => {
    if (sending) {
      // 开始发送时，重置滚动状态并滚动到底部
      userScrolling.value = false
      scheduleScrollToBottom(false)
    }
  },
  { flush: 'post' }
)

// 监听对话切换，滚动到底部
watch(
  () => props.currentChatId,
  () => {
    userScrolling.value = false
    dismissedQuickReplyIds.value = new Set()
    scheduleScrollToBottom(false)
  },
  { flush: 'post' }
)

watch(
  () => (props.messages ?? []).map((message) => message.id),
  (messageIds) => {
    const validMessageIds = new Set(messageIds)
    const nextSelectedIds = new Set(
      [...dismissedQuickReplyIds.value].filter((messageId) => validMessageIds.has(messageId))
    )

    if (nextSelectedIds.size !== dismissedQuickReplyIds.value.size) {
      dismissedQuickReplyIds.value = nextSelectedIds
    }
  },
  { flush: 'post' }
)

/**
 * 当前可交互的快捷回复
 * 仅针对最新一条、且之后没有用户继续输入的 assistant 消息
 */
const activeQuickReply = computed<MessageOptionContext | null>(() => {
  const messages = props.messages ?? []

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]

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

const visibleMessages = computed(() => {
  return (props.messages ?? []).filter((message) => message.role !== 'tool')
})

const messageCountLabel = computed(() => {
  const count = visibleMessages.value.length
  return count > 0 ? `${count} 条消息` : '暂无消息'
})

const modelBadgeLabel = computed(() => {
  return props.currentModelName || props.selectedModel || '未选择模型'
})

onMounted(() => {
  // 初始滚动到底部
  scrollToBottom(false)
  const el = messagesAreaRef.value
  if (el) {
    lastScrollTop.value = el.scrollTop
  }
})

onBeforeUnmount(() => {
  cancelScheduledScroll()
})

function handleSendMessage(
  message: string,
  model: string,
  selectedTools: MCPTool[],
  selectedKnowledgeBases: KnowledgeBase[],
  enableSandboxTools: boolean,
  attachedDocuments: AttachedDocument[],
  attachedImages: AttachedImage[]
): void {
  window.api.logger.debug('[MainContent] 处理发送消息事件', {
    messageLength: message.length,
    model,
    selectedToolsCount: selectedTools?.length ?? 0,
    selectedKnowledgeBasesCount: selectedKnowledgeBases?.length ?? 0,
    enableSandboxTools,
    attachedDocumentsCount: attachedDocuments?.length ?? 0,
    attachedImagesCount: attachedImages?.length ?? 0
  })
  emit(
    'send-message',
    message,
    model,
    selectedTools,
    selectedKnowledgeBases,
    enableSandboxTools,
    attachedDocuments,
    attachedImages
  )
}

function handleStopRequest(): void {
  emit('stop-request')
}

function handleUpdateInputMessage(value: string): void {
  emit('update:inputMessage', value)
}

function handleUpdateSelectedModel(value: string): void {
  emit('update:selectedModel', value)
}

function handleUpdateSelectedTools(value: MCPTool[]): void {
  emit('update:selectedMCPTools', value)
}

function handleUpdateSelectedKnowledgeBases(value: KnowledgeBase[]): void {
  emit('update:selectedKnowledgeBases', value)
}

function handleUpdateEnableSandboxTools(value: boolean): void {
  emit('update:enableSandboxTools', value)
}

function handleRequestExport(message: Message): void {
  emit('request-export', message)
}

function handleQuickReplySelected(messageId: string): void {
  dismissedQuickReplyIds.value = new Set(dismissedQuickReplyIds.value).add(messageId)
}

function handleSelectExportFormat(format: ExportFormat): void {
  emit('select-export-format', format)
}

/**
 * 切换思考内容展开/折叠
 */
function toggleReasoning(msgId: string): void {
  if (expandedReasoningIds.value.has(msgId)) {
    expandedReasoningIds.value.delete(msgId)
  } else {
    expandedReasoningIds.value.add(msgId)
  }
}

/**
 * 检查消息思考内容是否展开
 */
function isReasoningExpanded(msgId: string): boolean {
  return expandedReasoningIds.value.has(msgId)
}

/**
 * 判断消息是否包含可展示的 ReAct 分阶段信息
 */
function hasRenderableReact(message: Message): boolean {
  const hasIterationContent =
    message.reactIterations?.some(
      (iteration) => iteration.reasoning.trim().length > 0 || iteration.steps.length > 0
    ) || false

  const hasLegacySteps = (message.reactSteps?.length || 0) > 0

  return message.role === 'assistant' && (hasIterationContent || hasLegacySteps)
}
</script>

<template>
  <main class="sm-chat-layout">
    <section class="sm-chat-stage">
      <div
        ref="messagesAreaRef"
        class="sm-chat-stage__scroll"
        @scroll="handleScroll"
        @wheel.passive="handleWheel"
      >
        <div v-if="!currentChatId" class="sm-chat-empty sm-empty">
          <span class="sm-chat-empty__eyebrow">聊天工作区</span>
          <h2 class="sm-chat-empty__title">选择已有会话，或创建新的智能体会话。</h2>
          <p class="sm-chat-empty__description">
            消息、推理过程和工具结果会在这里按工作流持续沉淀。
          </p>
        </div>

        <div v-else class="sm-message-stage">
          <header class="sm-message-stage__header">
            <div>
              <span class="sm-message-stage__eyebrow">聊天工作区</span>
              <h2 class="sm-message-stage__title">消息流</h2>
            </div>
            <div class="sm-message-stage__meta">
              <span class="sm-badge">{{ messageCountLabel }}</span>
              <span class="sm-badge">{{ modelBadgeLabel }}</span>
            </div>
          </header>

          <div class="sm-message-list">
            <ChatMessage
              v-for="msg in visibleMessages"
              :key="msg.id"
              :message="msg"
              :current-model-name="props.currentModelName"
              :is-reasoning-expanded="isReasoningExpanded(msg.id)"
              :current-chat-id="currentChatId"
              :is-exporting="props.exportingMessageId === msg.id"
              @toggle-reasoning="toggleReasoning"
              @request-export="handleRequestExport(msg)"
            >
              <template #react-steps>
                <ReActSteps
                  v-if="hasRenderableReact(msg)"
                  :steps="msg.reactSteps"
                  :iterations="msg.reactIterations"
                  :is-streaming="msg.isStreaming"
                />
              </template>
            </ChatMessage>
          </div>
        </div>
      </div>
    </section>

    <section class="sm-composer-stage">
      <div class="sm-composer-stage__inner">
        <MessageInput
          :key="props.currentChatId || 'no-chat-input'"
          :is-sending="props.isSending"
          :input-message="props.inputMessage"
          :selected-model="props.selectedModel"
          :selected-m-c-p-tools="props.selectedMCPTools"
          :selected-knowledge-bases="props.selectedKnowledgeBases"
          :enable-sandbox-tools="props.enableSandboxTools"
          :export-interaction-info="props.exportInteractionInfo"
          :quick-reply-info="activeQuickReply"
          @send="handleSendMessage"
          @stop="handleStopRequest"
          @quick-reply-selected="handleQuickReplySelected"
          @update:input-message="handleUpdateInputMessage"
          @update:selected-model="handleUpdateSelectedModel"
          @update:selected-m-c-p-tools="handleUpdateSelectedTools"
          @update:selected-knowledge-bases="handleUpdateSelectedKnowledgeBases"
          @update:enable-sandbox-tools="handleUpdateEnableSandboxTools"
          @select-export-format="handleSelectExportFormat"
        />
      </div>
    </section>
  </main>
</template>

<style scoped>
.sm-chat-layout {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--sm-color-bg-canvas);
  overflow: hidden;
}

.sm-chat-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--sm-color-bg-canvas);
}

.sm-chat-stage__scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--sm-space-6);
}

.sm-chat-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: var(--sm-space-3);
  height: 100%;
  max-width: 720px;
  margin: 0 auto;
}

.sm-chat-empty__eyebrow,
.sm-message-stage__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.sm-chat-empty__title,
.sm-message-stage__title {
  margin: 0;
  font-size: 18px;
  line-height: 1.35;
  color: var(--sm-color-text-primary);
}

.sm-chat-empty__description {
  margin: 0;
  max-width: 520px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--sm-color-text-secondary);
}

.sm-message-stage,
.sm-composer-stage__inner {
  width: min(100%, 920px);
  margin: 0 auto;
}

.sm-message-stage {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-5);
}

.sm-message-stage__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding-bottom: var(--sm-space-4);
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.sm-message-stage__meta {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-wrap: wrap;
}

.sm-message-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-5);
  min-width: 0;
}

.sm-composer-stage {
  padding: 0 var(--sm-space-6) var(--sm-space-6);
  background: var(--sm-color-bg-canvas);
}

@media (max-width: 960px) {
  .sm-chat-stage__scroll,
  .sm-composer-stage {
    padding-right: var(--sm-space-4);
    padding-left: var(--sm-space-4);
  }
}

@media (max-width: 768px) {
  .sm-message-stage__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .sm-chat-empty__title,
  .sm-message-stage__title {
    font-size: 16px;
  }
}
</style>
