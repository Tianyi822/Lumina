<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'
import ReasoningPanel from './ReasoningPanel.vue'
import type { Message } from '@renderer/types'

// 初始化 markdown-it 实例
const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true
})

const props = defineProps<{
  message: Message
  currentModelName?: string
  isReasoningExpanded?: boolean
  currentChatId?: string
}>()

const emit = defineEmits<{
  (e: 'toggle-reasoning', messageId: string): void
}>()

/**
 * 格式化 Token 统计
 */
function formatTokenUsage(usage: {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens?: number
}): string {
  let result = `输入: ${usage.prompt_tokens} | 输出: ${usage.completion_tokens} | 总计: ${usage.total_tokens}`
  if (usage.reasoning_tokens) {
    result += ` | 思考: ${usage.reasoning_tokens}`
  }
  return result
}

/**
 * 渲染 Markdown 内容
 */
function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}

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
  <div class="chat-message" :class="[`role-${message.role}`, { streaming: message.isStreaming }]">
    <!-- 消息头部：头像和发送者信息 -->
    <div class="message-header">
      <!-- 头像 -->
      <div class="message-avatar">
        <div v-if="message.role === 'user'" class="avatar user-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div v-else class="avatar ai-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="9" x2="15" y2="9" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>
      </div>

      <!-- 发送者信息 -->
      <div class="sender-info">
        <span class="sender-name">{{ senderName }}</span>
        <span v-if="message.reasoning" class="thinking-indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          已思考
        </span>
      </div>
    </div>

    <!-- 消息内容区域 -->
    <div class="message-body">
      <!-- 思考内容面板 -->
      <ReasoningPanel
        v-if="message.reasoning"
        :content="message.reasoning"
        :is-expanded="isReasoningExpanded"
        @toggle="handleToggleReasoning"
      />

      <!-- ReAct 推理步骤 -->
      <slot name="react-steps"></slot>

      <!-- 消息气泡 -->
      <div class="message-bubble" :class="{ streaming: message.isStreaming }">
        <!-- 用户消息：纯文本 -->
        <template v-if="message.role === 'user'">
          <span class="message-text">{{ message.content }}</span>
        </template>

        <!-- AI 消息：Markdown 渲染 -->
        <template v-else>
          <div class="markdown-body" v-html="renderMarkdown(message.content)"></div>
          <span v-if="message.isStreaming" class="streaming-cursor">▊</span>
        </template>
      </div>

      <!-- 消息元信息行：时间戳、Token统计、反馈按钮 -->
      <div
        v-if="
          showTimestamp || (message.role === 'assistant' && !message.isStreaming && message.usage)
        "
        class="message-meta-row"
      >
        <!-- 时间戳 -->
        <div v-if="showTimestamp" class="message-time">
          {{ formattedTime }}
        </div>

        <!-- Token 统计（仅 AI 消息） -->
        <div
          v-if="message.role === 'assistant' && !message.isStreaming && message.usage"
          class="token-usage"
        >
          {{ formatTokenUsage(message.usage) }}
        </div>

        <!-- 反馈按钮（仅 AI 消息） -->
        <div v-if="message.role === 'assistant' && !message.isStreaming" class="message-feedback">
          <slot
            name="feedback"
            :message-id="message.id"
            :session-id="currentChatId"
            :content="message.content"
          ></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-message {
  display: flex;
  flex-direction: column;
  gap: var(--theme-spacing-sm);
  max-width: 85%;
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
  width: 34px;
  height: 34px;
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
  background: #46AA8F;
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
  margin-left: 48px;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}

.chat-message.role-user .message-body {
  margin-left: 0;
  margin-right: 48px;
}

/* 消息气泡 */
.message-bubble {
  padding: 14px 18px;
  border-radius: var(--theme-radius-lg);
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  min-width: 0;
  transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* 用户消息气泡 */
.chat-message.role-user .message-bubble {
  background: #46AA8F;
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
    linear-gradient(135deg, var(--glass-white-027, rgba(255,255,255,0.027)) 0%, var(--glass-white-013, rgba(255,255,255,0.013)) 100%),
    var(--bubble-ai-bg, var(--theme-bg-secondary));
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid var(--glass-white-1, rgba(255,255,255,0.1));
  color: var(--bubble-ai-text, var(--theme-text));
  border-bottom-left-radius: 4px;
  box-shadow:
    0 2px 12px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 var(--glass-white-1, rgba(255,255,255,0.1));
}

.chat-message.role-assistant .message-bubble:hover {
  border-color: var(--glass-white-15, rgba(255,255,255,0.15));
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 var(--glass-white-15, rgba(255,255,255,0.15));
}

/* 流式输出状态 */
.message-bubble.streaming {
  border-color: rgba(99, 102, 241, 0.3);
  box-shadow:
    0 0 0 2px rgba(99, 102, 241, 0.1),
    0 2px 12px rgba(99, 102, 241, 0.08);
}

/* 用户消息文本 */
.message-text {
  white-space: pre-wrap;
}

/* 流式光标 */
.streaming-cursor {
  display: inline-block;
  animation: blink 1s step-end infinite;
  color: var(--theme-accent);
  margin-left: 2px;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

/* 消息元信息行：时间戳、Token统计、反馈按钮 */
.message-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  min-height: calc(11px + 8px + 2px); /* font-size + padding-top/bottom + border */
}

/* 时间戳 */
.message-time {
  font-size: 11px;
  color: var(--theme-text-tertiary);
  padding: 4px 8px;
  line-height: 1;
  display: flex;
  align-items: center;
}

/* Token 统计样式 */
.token-usage {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--theme-text-tertiary);
  background:
    linear-gradient(135deg, var(--glass-white-05, rgba(255,255,255,0.05)) 0%, var(--glass-white-027, rgba(255,255,255,0.027)) 100%);
  border: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
  border-radius: 4px;
  line-height: 1;
  display: flex;
  align-items: center;
  width: fit-content;
}

/* 消息反馈样式 - 高度与 token-usage 一致 */
.message-feedback {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  font-size: 11px;
  line-height: 1;
  border: 1px solid transparent;
  border-radius: 4px;
  box-sizing: border-box;
}

/* Markdown 内容样式 */
.markdown-body {
  color: inherit;
  max-width: 100%;
  overflow-wrap: break-word;
  min-width: 0;
}

.markdown-body :deep(p) {
  margin: 0 0 0.75em 0;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 1em 0 0.5em 0;
  font-weight: 600;
  line-height: 1.3;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-body :deep(li) {
  margin: 0.25em 0;
}

.markdown-body :deep(code) {
  background-color: var(--glass-white-08, rgba(255,255,255,0.08));
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: var(--theme-font-mono, 'JetBrains Mono', 'Fira Code', monospace);
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  background:
    linear-gradient(135deg, var(--glass-white-03, rgba(255,255,255,0.03)) 0%, var(--glass-white-017, rgba(255,255,255,0.017)) 100%),
    var(--theme-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 12px 16px;
  border-radius: var(--theme-radius);
  overflow-x: auto;
  margin: 0.75em 0;
  border: 1px solid var(--glass-white-08, rgba(255,255,255,0.08));
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.5;
}

.markdown-body :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.5em 1em;
  border-left: 3px solid var(--theme-accent);
  background: var(--thinking-bg, rgba(99, 102, 241, 0.08));
  border-radius: 0 var(--theme-radius-sm) var(--theme-radius-sm) 0;
}

.markdown-body :deep(a) {
  color: var(--theme-accent);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75em 0;
  display: block;
  max-width: 100%;
  overflow-x: auto;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--theme-border);
  padding: 8px 12px;
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: var(--theme-bg-tertiary, rgba(0, 0, 0, 0.2));
  font-weight: 600;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--theme-border);
  margin: 1em 0;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}

.markdown-body :deep(em) {
  font-style: italic;
}
</style>
