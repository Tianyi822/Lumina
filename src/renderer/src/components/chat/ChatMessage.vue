<script setup lang="ts">
import { computed, toRef, useSlots } from 'vue'
import ReasoningPanel from './ReasoningPanel.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import MessageContent from './message/MessageContent.vue'
import StreamingContent from './message/StreamingContent.vue'
import MessageAttachments from './message/MessageAttachments.vue'
import MessageActions from './message/MessageActions.vue'
import TokenStats from './message/TokenStats.vue'
import { useStreamingReveal } from './composables/useStreamingReveal'
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
const { displayedContent } = useStreamingReveal(toRef(props, 'message'))

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
    class="chat-message"
    :class="[`role-${message.role}`, { streaming: message.isStreaming }]"
  >
    <!-- 消息头部：头像和发送者信息 -->
    <div class="message-header">
      <!-- 头像 -->
      <div class="message-avatar">
        <div v-if="message.role === 'user'" class="avatar user-avatar">
          <SvgIcon name="avatar-user" :size="18" />
        </div>
        <div v-else class="avatar ai-avatar">
          <SvgIcon name="avatar-ai" :size="18" />
        </div>
      </div>

      <!-- 发送者信息 -->
      <div class="sender-info">
        <span class="sender-name">{{ senderName }}</span>
        <span v-if="showTimestamp" class="sender-time">{{ formattedTime }}</span>
        <span v-if="hasStructuredReact" class="thinking-indicator">
          <SvgIcon name="thinking" :size="12" />
          分阶段推理
        </span>
        <span v-else-if="showStandaloneReasoning" class="thinking-indicator">
          <SvgIcon name="thinking" :size="12" />
          已思考
        </span>
      </div>
    </div>

    <!-- 消息内容区域 -->
    <div class="message-body">
      <!-- 思考内容面板（仅在无迭代分组时独立显示） -->
      <Transition name="panel-fade">
        <ReasoningPanel
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
      <MessageAttachments
        :attachments="{
          documents: message.attachedDocuments,
          images: message.attachedImages
        }"
      />

      <!-- 消息气泡 -->
      <div
        v-if="shouldShowBubble"
        class="message-bubble"
        :class="{ streaming: message.isStreaming }"
      >
        <StreamingContent
          v-if="showWaitingPlaceholder"
          :has-tool-activity="hasToolActivity"
          :show-standalone-reasoning="showStandaloneReasoning"
          :has-structured-react="hasStructuredReact"
        />
        <MessageContent
          v-else
          :content="displayedContent"
          :is-streaming="message.isStreaming"
          :role="message.role"
        />
      </div>

      <!-- 消息元信息行：Token统计、反馈按钮 -->
      <Transition name="meta-fade">
        <div v-if="showMetaRow" class="message-meta-row">
          <!-- Token 统计（用户消息估算 / AI 消息真实值） -->
          <TokenStats
            :usage="message.role === 'assistant' ? message.usage : undefined"
            :user-token-label="message.role === 'user' ? userTokenUsageLabel : undefined"
          />

          <!-- 操作按钮（仅 AI 消息） -->
          <MessageActions v-if="showAssistantActions" :has-feedback-slot="hasFeedbackSlot">
            <template #feedback>
              <slot
                name="feedback"
                :message-id="message.id"
                :session-id="currentChatId"
                :content="message.content"
              ></slot>
            </template>
          </MessageActions>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.chat-message {
  --message-avatar-size: 32px;
  --message-header-gap: var(--sm-space-2);
  --message-content-offset: calc(var(--message-avatar-size) + var(--message-header-gap));
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

.chat-message.role-user {
  width: min(100%, 640px);
  align-self: flex-end;
  align-items: flex-end;
}

.chat-message.role-assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.message-header {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  min-height: var(--message-avatar-size);
}

.chat-message.role-user .message-header {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.avatar {
  width: var(--message-avatar-size);
  height: var(--message-avatar-size);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.avatar svg {
  width: 18px;
  height: 18px;
}

.user-avatar {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-accent-14);
  color: var(--sm-color-accent-hover);
}

.ai-avatar {
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
}

.sender-info {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  min-width: 0;
  flex-wrap: wrap;
}

.chat-message.role-user .sender-info {
  flex-direction: row-reverse;
}

.sender-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sender-time {
  font-size: 11px;
  color: var(--sm-color-text-tertiary);
  line-height: 1;
}

.thinking-indicator {
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

.thinking-indicator svg {
  width: 12px;
  height: 12px;
}

.message-body {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
  margin-left: var(--message-content-offset);
  width: fit-content;
  max-width: 100%;
  min-width: 0;
}

.chat-message.role-user .message-body {
  margin-left: 0;
  margin-right: var(--message-content-offset);
}

.message-bubble {
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
  max-width: 100%;
  min-width: 0;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.chat-message.role-user .message-bubble {
  align-self: flex-end;
  background: var(--sm-color-accent-12);
  border-color: var(--sm-color-border-accent);
}

.chat-message.role-user .message-bubble:hover {
  background: var(--sm-color-accent-18);
  border-color: var(--sm-color-accent-28);
}

.chat-message.role-assistant .message-bubble {
  background: var(--sm-color-surface-1);
}

.chat-message.role-assistant .message-bubble:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.message-bubble.streaming {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-surface-active);
}

.message-meta-row {
  --message-meta-text-color: var(--sm-color-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  align-self: flex-start;
  gap: var(--sm-space-2);
  width: 100%;
  max-width: 100%;
  margin-top: 4px;
  min-height: 26px;
  color: var(--message-meta-text-color);
}

.chat-message.role-user .message-meta-row {
  align-self: flex-end;
  width: fit-content;
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
  .chat-message,
  .chat-message.role-user {
    width: 100%;
    max-width: 100%;
  }

  .message-body {
    margin-left: 0;
    margin-right: 0;
  }

  .chat-message.role-user .message-body {
    margin-right: 0;
  }
}
</style>
