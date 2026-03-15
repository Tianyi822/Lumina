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
  isExporting?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle-reasoning', messageId: string): void
  (e: 'request-export'): void
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
 * 当前消息是否可导出
 */
const canExportMessage = computed(() => {
  return (
    props.message.role === 'assistant' &&
    !props.message.isStreaming &&
    !!props.message.content.trim()
  )
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
  return (
    props.message.role === 'assistant' &&
    !props.message.isStreaming &&
    (canExportMessage.value || hasFeedbackSlot.value)
  )
})

/**
 * 是否显示消息元信息行
 */
const showMetaRow = computed(() => {
  return (
    (props.message.role === 'assistant' &&
      !props.message.isStreaming &&
      (!!props.message.usage || canExportMessage.value)) ||
    (props.message.role === 'user' && !props.message.isStreaming)
  )
})

/**
 * 是否存在按阶段组织的 ReAct 过程
 */
const hasStructuredReact = computed(() => {
  return (
    props.message.reactIterations?.some(
      (iteration) => iteration.reasoning.trim().length > 0 || iteration.steps.length > 0
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
    !hasToolActivity.value
  )
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

/**
 * 处理导出请求
 */
function handleRequestExport(): void {
  emit('request-export')
}
</script>

<template>
  <div class="chat-message" :class="[`role-${message.role}`, { streaming: message.isStreaming }]">
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
      <div class="message-bubble" :class="{ streaming: message.isStreaming }">
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
          <MessageActions
            v-if="showAssistantActions"
            :can-export="canExportMessage"
            :is-exporting="isExporting"
            :has-feedback-slot="hasFeedbackSlot"
            @export="handleRequestExport"
          >
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
  --message-avatar-size: 34px;
  --message-header-gap: var(--theme-spacing-sm);
  --message-content-offset: calc(var(--message-avatar-size) + var(--message-header-gap));
  display: flex;
  flex-direction: column;
  gap: var(--theme-spacing-sm);
  max-width: 85%;
  animation: messageAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* 消息出现动画 */
@keyframes messageAppear {
  0% {
    opacity: 0;
    transform: translateY(12px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 用户消息从右侧出现 */
.chat-message.role-user {
  animation: messageAppearRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes messageAppearRight {
  0% {
    opacity: 0;
    transform: translateX(20px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

/* AI消息从左侧出现 */
.chat-message.role-assistant {
  animation: messageAppearLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes messageAppearLeft {
  0% {
    opacity: 0;
    transform: translateX(-20px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 用户消息：右侧对齐 */
.chat-message.role-user {
  align-self: flex-end;
  align-items: flex-end;
}

/* AI 消息：左侧对齐 */
.chat-message.role-assistant {
  align-self: flex-start;
  align-items: flex-start;
}

/* 消息头部 */
.message-header {
  display: flex;
  align-items: center;
  gap: var(--theme-spacing-sm);
}

/* 用户消息头部反向排列 */
.chat-message.role-user .message-header {
  flex-direction: row-reverse;
}

/* 头像 */
.message-avatar {
  flex-shrink: 0;
}

.avatar {
  width: var(--message-avatar-size);
  height: var(--message-avatar-size);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.avatar svg {
  width: 18px;
  height: 18px;
}

.user-avatar {
  background: #46aa8f;
  color: white;
  box-shadow: 0 2px 8px rgba(70, 170, 143, 0.25);
}

.ai-avatar {
  background: var(--theme-accent);
  color: white;
  box-shadow: 0 2px 8px rgba(70, 170, 143, 0.2);
}

/* 发送者信息 */
.sender-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-message.role-user .sender-info {
  flex-direction: row-reverse;
}

.sender-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text-secondary);
}

.sender-time {
  font-size: 11px;
  color: var(--theme-text-tertiary);
  line-height: 1;
}

.thinking-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--thinking-bg, rgba(99, 102, 241, 0.08));
  border: 1px solid var(--thinking-border, rgba(99, 102, 241, 0.2));
  border-radius: 12px;
  font-size: 11px;
  color: var(--thinking-accent, var(--theme-accent-secondary));
}

.thinking-indicator svg {
  width: 12px;
  height: 12px;
}

/* 消息内容区域 */
.message-body {
  display: flex;
  flex-direction: column;
  gap: var(--theme-spacing-sm);
  margin-left: var(--message-content-offset);
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.chat-message.role-user .message-body {
  margin-left: 0;
  margin-right: var(--message-content-offset);
}

/* 消息气泡 */
.message-bubble {
  padding: 14px 18px;
  border-radius: var(--theme-radius-lg);
  font-size: 14px;
  line-height: 1.7;
  align-self: flex-start;
  width: fit-content;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  min-width: 0;
  transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* 用户消息气泡 */
.chat-message.role-user .message-bubble {
  align-self: flex-end;
  background: #46aa8f;
  color: var(--bubble-user-text, white);
  border-bottom-right-radius: 4px;
  box-shadow: 0 4px 16px rgba(70, 170, 143, 0.2);
}

.chat-message.role-user .message-bubble:hover {
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);
}

/* AI 消息气泡 - 玻璃效果 */
.chat-message.role-assistant .message-bubble {
  background:
    linear-gradient(
      135deg,
      var(--glass-white-027, rgba(255, 255, 255, 0.027)) 0%,
      var(--glass-white-013, rgba(255, 255, 255, 0.013)) 100%
    ),
    var(--bubble-ai-bg, var(--theme-bg-secondary));
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid var(--glass-white-1, rgba(255, 255, 255, 0.1));
  color: var(--bubble-ai-text, var(--theme-text));
  border-bottom-left-radius: 4px;
  box-shadow:
    0 2px 12px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 var(--glass-white-1, rgba(255, 255, 255, 0.1));
}

.chat-message.role-assistant .message-bubble:hover {
  border-color: var(--glass-white-15, rgba(255, 255, 255, 0.15));
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 var(--glass-white-15, rgba(255, 255, 255, 0.15));
}

/* 流式输出状态 */
.message-bubble.streaming {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow:
    0 0 0 2px rgba(99, 102, 241, 0.1),
    0 2px 12px rgba(99, 102, 241, 0.08);
}

/* 消息元信息行：时间戳、Token统计、反馈按钮 */
.message-meta-row {
  --message-meta-text-color: var(--theme-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  align-self: flex-start;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  margin-top: 4px;
  min-height: calc(11px + 8px + 2px); /* font-size + padding-top/bottom + border */
  color: var(--message-meta-text-color);
}

.chat-message.role-user .message-meta-row {
  align-self: flex-end;
  width: fit-content;
}

/* ========== 过渡动画 ========== */
/* 思考面板淡入动画 */
.panel-fade-enter-active {
  animation: panelFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-fade-leave-active {
  animation: panelFadeOut 0.2s ease-out;
}

@keyframes panelFadeIn {
  0% {
    opacity: 0;
    transform: translateY(-10px);
    max-height: 0;
  }
  100% {
    opacity: 1;
    transform: translateY(0);
    max-height: 500px;
  }
}

@keyframes panelFadeOut {
  0% {
    opacity: 1;
    transform: translateY(0);
    max-height: 500px;
  }
  100% {
    opacity: 0;
    transform: translateY(-10px);
    max-height: 0;
  }
}

/* 元信息行淡入动画 */
.meta-fade-enter-active {
  animation: metaFadeIn 0.25s ease-out;
}

.meta-fade-leave-active {
  animation: metaFadeOut 0.15s ease-out;
}

@keyframes metaFadeIn {
  0% {
    opacity: 0;
    transform: translateY(5px);
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
    transform: translateY(5px);
  }
}
</style>
