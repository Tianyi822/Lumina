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
import styles from './PaperChatMessage.module.css'

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
        iteration.isActive ||
        iteration.reasoning.trim().length > 0 ||
        iteration.steps.length > 0 ||
        (iteration.content?.trim().length ?? 0) > 0
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
    !props.message.suppressWaitingPlaceholder &&
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
  if (
    props.message.role === 'assistant' &&
    props.message.isStreaming &&
    props.message.suppressWaitingPlaceholder &&
    !props.message.content?.trim() &&
    !displayedContent.value?.trim() &&
    !showStandaloneReasoning.value &&
    !hasStructuredReact.value &&
    !hasToolActivity.value
  ) {
    return false
  }
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
    :class="[
      styles['paper-chat-message'],
      `paper-chat-message--${message.role}`,
      { [styles['is-streaming']]: message.isStreaming }
    ]"
  >
    <!-- 消息头部：头像和发送者信息 -->
    <div :class="styles['paper-chat-message__header']">
      <!-- 头像 -->
      <div :class="styles['paper-chat-message__avatar']">
        <div
          v-if="message.role === 'user'"
          :class="[
            styles['paper-chat-message__avatar-frame'],
            styles['paper-chat-message__avatar-frame--user']
          ]"
        >
          <SvgIcon name="avatar-user" :size="18" />
        </div>
        <div
          v-else
          :class="[
            styles['paper-chat-message__avatar-frame'],
            styles['paper-chat-message__avatar-frame--assistant']
          ]"
        >
          <SvgIcon name="avatar-ai" :size="18" />
        </div>
      </div>

      <!-- 发送者信息 -->
      <div :class="styles['paper-chat-message__sender']">
        <span :class="styles['paper-chat-message__sender-name']">{{ senderName }}</span>
        <span v-if="showTimestamp" :class="styles['paper-chat-message__sender-time']">{{
          formattedTime
        }}</span>
        <span v-if="hasStructuredReact" :class="styles['paper-chat-message__thinking-indicator']">
          <SvgIcon name="thinking" :size="12" />
          分阶段推理
        </span>
        <span
          v-else-if="showStandaloneReasoning"
          :class="styles['paper-chat-message__thinking-indicator']"
        >
          <SvgIcon name="thinking" :size="12" />
          已思考
        </span>
      </div>
    </div>

    <!-- 消息内容区域 -->
    <div :class="styles['paper-chat-message__body']">
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
        :class="styles['paper-chat-message__attachments']"
        :attachments="{
          documents: message.attachedDocuments,
          images: message.attachedImages,
          quotes: message.attachedQuotes
        }"
      />

      <!-- 消息气泡 -->
      <div
        v-if="shouldShowBubble"
        :class="[styles['paper-chat-message__bubble'], { streaming: message.isStreaming }]"
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
        <div v-if="showMetaRow" :class="styles['paper-chat-message__meta-row']">
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
