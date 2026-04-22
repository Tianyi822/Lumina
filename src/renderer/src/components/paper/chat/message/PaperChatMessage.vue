<script setup lang="ts">
import { computed, toRef, useSlots } from 'vue'
import PaperChatReasoningPanel from './PaperChatReasoningPanel.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import PaperChatMessageContent from './PaperChatMessageContent.vue'
import PaperChatStreamingContent from './PaperChatStreamingContent.vue'
import PaperChatMessageAttachments from './PaperChatMessageAttachments.vue'
import PaperChatMessageActions from './PaperChatMessageActions.vue'
import PaperChatTokenStats from './PaperChatTokenStats.vue'
import { usePaperChatStreamingReveal } from '../composables/usePaperChatStreamingReveal'
import type { Message } from '@renderer/types'
import { estimateTokenCount, formatTokenCount } from '@renderer/utils/tokenEstimate'

const slots = useSlots()

const props = defineProps<{
  message: Message
  currentModelName?: string
  isReasoningExpanded?: boolean
  currentChatId?: string
}>()

const emit = defineEmits<{
  (e: 'toggle-reasoning', messageId: string): void
}>()

// 使用流式显示逻辑
const { displayedContent } = usePaperChatStreamingReveal(toRef(props, 'message'))

/**
 * 格式化时间戳
 */
const formattedTime = computed(() => {
  if (!props.message.timestamp) return ''
  const date = new Date(props.message.timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
})

/**
 * 判断是否显示时间戳
 */
const showTimestamp = computed(() => {
  return !!props.message.timestamp && !props.message.isStreaming
})

/**
 * 是否存在反馈插槽内容
 */
const hasFeedbackSlot = computed(() => {
  return !!slots.feedback
})

/**
 * 是否展示 AI 消息操作区
 */
const showAssistantActions = computed(() => {
  return props.message.role === 'assistant' && !props.message.isStreaming && hasFeedbackSlot.value
})

/**
 * 是否显示消息元信息行
 */
const showMetaRow = computed(() => {
  return (
    (props.message.role === 'assistant' &&
      !props.message.isStreaming &&
      (!!props.message.usage || showAssistantActions.value)) ||
    (props.message.role === 'user' && !props.message.isStreaming)
  )
})

/**
 * 是否存在按阶段组织的 ReAct 过程
 */
const hasStructuredReact = computed(() => {
  return (
    props.message.reactIterations?.some(
      (iteration) =>
        iteration.isActive || iteration.reasoning.trim().length > 0 || iteration.steps.length > 0
    ) || false
  )
})

/**
 * 是否有活跃但为空的迭代（需要显示占位符）
 */
const hasActiveIteration = computed(() => {
  return (
    props.message.reactIterations?.some(
      (iteration) => iteration.isActive && !iteration.reasoning && iteration.steps.length === 0
    ) || false
  )
})

/**
 * 是否展示传统的独立思考面板
 */
const showStandaloneReasoning = computed(() => {
  return !!props.message.reasoning && !hasStructuredReact.value
})

/**
 * 是否存在可展示的附件
 */
const hasMessageAttachments = computed(() => {
  return (
    (props.message.attachedDocuments?.length || 0) > 0 ||
    (props.message.attachedImages?.length || 0) > 0 ||
    (props.message.attachedQuotes?.length || 0) > 0
  )
})

/**
 * 是否已有工具阶段活动
 */
const hasToolActivity = computed(() => {
  const iterationHasSteps =
    props.message.reactIterations?.some((iteration) => iteration.steps.length > 0) || false

  return (
    iterationHasSteps ||
    (props.message.reactSteps?.length || 0) > 0 ||
    !!props.message.tool_calls?.length
  )
})

/**
 * 是否显示等待首段回复的占位态
 */
const showWaitingPlaceholder = computed(() => {
  return (
    props.message.role === 'assistant' &&
    !!props.message.isStreaming &&
    !props.message.content &&
    !displayedContent.value &&
    !showStandaloneReasoning.value &&
    !hasStructuredReact.value &&
    !hasToolActivity.value &&
    !hasActiveIteration.value
  )
})

/**
 * AI 消息是否有实际内容（非空白）
 */
const hasAssistantContent = computed(() => {
  if (props.message.role !== 'assistant') return true
  // 流式传输中允许显示占位符
  if (props.message.isStreaming) return true
  // 有推理内容或工具活动时也算有内容
  if (showStandaloneReasoning.value || hasStructuredReact.value || hasToolActivity.value)
    return true
  // 检查正文内容是否非空
  return !!props.message.content?.trim()
})

/**
 * 是否应该渲染整个消息组件
 */
const shouldRenderMessage = computed(() => {
  // 用户消息始终显示
  if (props.message.role === 'user') return true
  // AI 消息需要检查是否有实际内容
  return hasAssistantContent.value
})

/**
 * 是否应该显示消息气泡
 */
const shouldShowBubble = computed(() => {
  // 用户消息始终显示气泡
  if (props.message.role === 'user') return true
  // 流式传输中且显示等待占位符时显示气泡
  if (showWaitingPlaceholder.value) return true
  // 检查是否有实际内容（同时检查原始内容和显示内容）
  const originalContent = props.message.content?.trim()
  const displayed = displayedContent.value?.trim()
  return !!(originalContent || displayed)
})

/**
 * 用户消息的估算 Token 显示
 */
const userTokenUsageLabel = computed(() => {
  if (props.message.role !== 'user' || props.message.isStreaming) {
    return ''
  }

  const estimatedTokens = estimateTokenCount(props.message.content)
  return `输入: 约 ${formatTokenCount(estimatedTokens)}`
})

/**
 * 获取消息发送者名称
 */
const senderName = computed(() => {
  if (props.message.role === 'user') return '用户'
  return props.message.modelName || props.currentModelName || 'AI'
})

/**
 * 处理思考内容切换
 */
function handleToggleReasoning(): void {
  emit('toggle-reasoning', props.message.id)
}
</script>

<template>
  <div
    v-if="shouldRenderMessage"
    class="paper-chat-message"
    :class="[`paper-chat-message--${message.role}`, { 'is-streaming': message.isStreaming }]"
  >
    <!-- 消息头部：头像和发送者信息 -->
    <div class="paper-chat-message__header">
      <!-- 头像 -->
      <div class="paper-chat-message__avatar">
        <div
          v-if="message.role === 'user'"
          class="paper-chat-message__avatar-frame paper-chat-message__avatar-frame--user"
        >
          <SvgIcon name="avatar-user" :size="18" />
        </div>
        <div
          v-else
          class="paper-chat-message__avatar-frame paper-chat-message__avatar-frame--assistant"
        >
          <SvgIcon name="avatar-ai" :size="18" />
        </div>
      </div>

      <!-- 发送者信息 -->
      <div class="paper-chat-message__sender">
        <span class="paper-chat-message__sender-name">{{ senderName }}</span>
        <span v-if="showTimestamp" class="paper-chat-message__sender-time">{{
          formattedTime
        }}</span>
        <span v-if="hasStructuredReact" class="paper-chat-message__thinking-indicator">
          <SvgIcon name="thinking" :size="12" />
          分阶段推理
        </span>
        <span v-else-if="showStandaloneReasoning" class="paper-chat-message__thinking-indicator">
          <SvgIcon name="thinking" :size="12" />
          已思考
        </span>
      </div>
    </div>

    <!-- 消息内容区域 -->
    <div class="paper-chat-message__body">
      <!-- 思考内容面板（仅在无迭代分组时独立显示） -->
      <Transition name="panel-fade">
        <PaperChatReasoningPanel
          v-if="showStandaloneReasoning"
          :content="message.reasoning || ''"
          :is-expanded="props.isReasoningExpanded"
          :reasoning-tokens="message.usage?.reasoning_tokens"
          @toggle="handleToggleReasoning"
        />
      </Transition>

      <!-- ReAct 推理步骤 -->
      <slot name="react-steps"></slot>

      <!-- 附件指示器（仅用户消息） -->
      <PaperChatMessageAttachments
        v-if="hasMessageAttachments"
        class="paper-chat-message__attachments"
        :attachments="{
          documents: message.attachedDocuments,
          images: message.attachedImages,
          quotes: message.attachedQuotes
        }"
      />

      <!-- 消息气泡 -->
      <div
        v-if="shouldShowBubble"
        class="paper-chat-message__bubble"
        :class="{ streaming: message.isStreaming }"
      >
        <PaperChatStreamingContent
          v-if="showWaitingPlaceholder"
          :has-tool-activity="hasToolActivity"
          :show-standalone-reasoning="showStandaloneReasoning"
          :has-structured-react="hasStructuredReact"
        />
        <PaperChatMessageContent
          v-else
          :content="displayedContent"
          :is-streaming="message.isStreaming"
          :role="message.role"
        />
      </div>

      <!-- 消息元信息行：Token统计、反馈按钮 -->
      <Transition name="meta-fade">
        <div v-if="showMetaRow" class="paper-chat-message__meta-row">
          <!-- Token 统计（用户消息估算 / AI 消息真实值） -->
          <PaperChatTokenStats
            :usage="message.role === 'assistant' ? message.usage : undefined"
            :user-token-label="message.role === 'user' ? userTokenUsageLabel : undefined"
          />

          <!-- 操作按钮（仅 AI 消息） -->
          <PaperChatMessageActions v-if="showAssistantActions" :has-feedback-slot="hasFeedbackSlot">
            <template #feedback>
              <slot
                name="feedback"
                :message-id="message.id"
                :session-id="currentChatId"
                :content="message.content"
              ></slot>
            </template>
          </PaperChatMessageActions>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.paper-chat-message {
  --paper-chat-message-avatar-size: 32px;
  --paper-chat-message-header-gap: var(--sm-space-3);
  --paper-chat-message-content-offset: calc(
    var(--paper-chat-message-avatar-size) + var(--paper-chat-message-header-gap)
  );
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
  width: min(100%, 820px);
  animation: messageAppear 160ms ease;
}

@keyframes messageAppear {
  0% {
    opacity: 0;
    transform: translateY(6px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.paper-chat-message.paper-chat-message--user {
  width: min(100%, 640px);
  align-self: flex-end;
  align-items: flex-end;
}

.paper-chat-message.paper-chat-message--assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.paper-chat-message__header {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  justify-content: flex-start;
  min-height: var(--paper-chat-message-avatar-size);
  width: 100%;
}

.paper-chat-message.paper-chat-message--user .paper-chat-message__header {
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.paper-chat-message__avatar {
  flex-shrink: 0;
}

.paper-chat-message__avatar-frame {
  width: var(--paper-chat-message-avatar-size);
  height: var(--paper-chat-message-avatar-size);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.paper-chat-message__avatar-frame svg {
  width: 18px;
  height: 18px;
}

.paper-chat-message__avatar-frame--user {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-accent-14);
  color: var(--sm-color-accent-hover);
}

.paper-chat-message__avatar-frame--assistant {
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
}

.paper-chat-message__sender {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  min-width: 0;
  max-width: calc(100% - var(--paper-chat-message-content-offset));
  flex-wrap: wrap;
}

.paper-chat-message.paper-chat-message--user .paper-chat-message__sender {
  flex-direction: row-reverse;
  justify-content: flex-start;
  text-align: right;
}

.paper-chat-message__sender-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-chat-message__sender-time {
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
  line-height: 1;
}

.paper-chat-message__thinking-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--sm-color-accent-08);
  border: 1px solid var(--sm-color-accent-18);
  border-radius: 12px;
  font-size: 11px;
  color: var(--sm-color-accent-hover);
}

.paper-chat-message__thinking-indicator svg {
  width: 12px;
  height: 12px;
}

.paper-chat-message__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sm-space-2);
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.paper-chat-message.paper-chat-message--user .paper-chat-message__body {
  align-items: flex-end;
}

.paper-chat-message__bubble {
  padding: var(--sm-space-4) 18px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
  font-size: 14px;
  line-height: 1.65;
  align-self: flex-start;
  width: fit-content;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: calc(100% - var(--paper-chat-message-content-offset));
  min-width: 0;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.paper-chat-message.paper-chat-message--user .paper-chat-message__bubble {
  align-self: flex-end;
  background: var(--sm-color-accent-14);
  border-color: var(--sm-color-border-accent);
}

.paper-chat-message__attachments {
  max-width: calc(100% - var(--paper-chat-message-content-offset));
  min-width: 0;
}

.paper-chat-message.paper-chat-message--user .paper-chat-message__attachments {
  align-self: flex-end;
}

.paper-chat-message.paper-chat-message--user .paper-chat-message__attachments :deep(.document-indicators),
.paper-chat-message.paper-chat-message--user .paper-chat-message__attachments :deep(.quote-indicators),
.paper-chat-message.paper-chat-message--user .paper-chat-message__attachments :deep(.image-indicators) {
  justify-content: flex-end;
  padding-right: 0;
}

.paper-chat-message__attachments :deep(.document-indicators),
.paper-chat-message__attachments :deep(.quote-indicators),
.paper-chat-message__attachments :deep(.image-indicators) {
  margin-bottom: 0;
}

.paper-chat-message.paper-chat-message--assistant .paper-chat-message__attachments {
  align-self: flex-start;
}

.paper-chat-message__body :deep(.reasoning-panel),
.paper-chat-message__body :deep(.paper-chat-react-steps) {
  align-self: flex-start;
  width: calc(100% - var(--paper-chat-message-content-offset));
  max-width: calc(100% - var(--paper-chat-message-content-offset));
}

.paper-chat-message.paper-chat-message--user .paper-chat-message__bubble:hover {
  background: var(--sm-color-accent-18);
  border-color: var(--sm-color-accent-28);
}

.paper-chat-message.paper-chat-message--assistant .paper-chat-message__bubble {
  background: var(--sm-color-surface-1);
  border-color: var(--sm-color-border-default);
}

.paper-chat-message.paper-chat-message--assistant .paper-chat-message__bubble:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.paper-chat-message__bubble.is-streaming {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-surface-active);
}

.paper-chat-message__meta-row {
  --paper-chat-message-meta-text-color: var(--sm-color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  align-self: flex-start;
  gap: var(--sm-space-2);
  width: 100%;
  max-width: 100%;
  margin-top: 0;
  min-height: 0;
  color: var(--paper-chat-message-meta-text-color);
}

.paper-chat-message.paper-chat-message--user .paper-chat-message__meta-row {
  align-self: flex-end;
  width: fit-content;
  justify-content: flex-end;
}

/* ========== 过渡动画 ========== */
.panel-fade-enter-active {
  animation: panelFadeIn 160ms ease;
}

.panel-fade-leave-active {
  animation: panelFadeOut 140ms ease-out;
}

@keyframes panelFadeIn {
  0% {
    opacity: 0;
    transform: translateY(-4px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes panelFadeOut {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-4px);
  }
}

.meta-fade-enter-active {
  animation: metaFadeIn 160ms ease;
}

.meta-fade-leave-active {
  animation: metaFadeOut 120ms ease-out;
}

@keyframes metaFadeIn {
  0% {
    opacity: 0;
    transform: translateY(4px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes metaFadeOut {
  0% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (max-width: 768px) {
  .paper-chat-message,
  .paper-chat-message.paper-chat-message--user {
    width: 100%;
    max-width: 100%;
  }

  .paper-chat-message__body {
    width: 100%;
    max-width: 100%;
  }

  .paper-chat-message__bubble,
  .paper-chat-message__attachments,
  .paper-chat-message__body :deep(.reasoning-panel),
  .paper-chat-message__body :deep(.paper-chat-react-steps) {
    max-width: 100%;
  }

  .paper-chat-message__body :deep(.reasoning-panel),
  .paper-chat-message__body :deep(.paper-chat-react-steps) {
    width: 100%;
  }
}
</style>
