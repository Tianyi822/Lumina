<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ReasoningPanel from './ReasoningPanel.vue'
import type { Message } from '@renderer/types'
import { getFileTypeIcon } from '@renderer/utils/fileIcons'
import { estimateTokenCount, formatTokenCount } from '@renderer/utils/tokenEstimate'

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

const STREAM_REVEAL_INTERVAL = 32
const STREAM_REVEAL_MIN_CHARS = 6
const STREAM_REVEAL_MAX_CHARS = 48

const emit = defineEmits<{
  (e: 'toggle-reasoning', messageId: string): void
}>()

const displayedContent = ref(props.message.content)
const renderedMarkdown = computed(() => renderMarkdown(displayedContent.value))

let revealFrameId: number | null = null
let lastRevealTimestamp = 0

/**
 * 格式化 Token 统计
 */
function formatTokenUsage(usage: {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens?: number
}): string {
  let result = `输入: ${formatTokenCount(usage.prompt_tokens)} | 输出: ${formatTokenCount(usage.completion_tokens)} | 总计: ${formatTokenCount(usage.total_tokens)}`
  if (usage.reasoning_tokens) {
    result += ` | 思考: ${formatTokenCount(usage.reasoning_tokens)}`
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
 * 获取当前帧应当推进的字符数
 */
function getRevealStep(pendingLength: number): number {
  if (pendingLength > 320) return STREAM_REVEAL_MAX_CHARS
  if (pendingLength > 160) return 32
  if (pendingLength > 64) return 18
  return STREAM_REVEAL_MIN_CHARS
}

/**
 * 停止流式内容显示循环
 */
function stopRevealLoop(): void {
  if (revealFrameId !== null) {
    window.cancelAnimationFrame(revealFrameId)
    revealFrameId = null
  }
}

/**
 * 逐帧平滑追赶最新内容，避免每个 token 都触发一次完整重渲染
 */
function revealNextFrame(timestamp: number): void {
  revealFrameId = null

  const fullContent = props.message.content || ''

  if (props.message.role !== 'assistant' || !props.message.isStreaming) {
    displayedContent.value = fullContent
    lastRevealTimestamp = 0
    return
  }

  if (displayedContent.value.length > fullContent.length) {
    displayedContent.value = fullContent
  }

  if (displayedContent.value.length >= fullContent.length) {
    return
  }

  if (timestamp - lastRevealTimestamp < STREAM_REVEAL_INTERVAL) {
    revealFrameId = window.requestAnimationFrame(revealNextFrame)
    return
  }

  const pendingLength = fullContent.length - displayedContent.value.length
  const nextLength = Math.min(
    fullContent.length,
    displayedContent.value.length + getRevealStep(pendingLength)
  )

  displayedContent.value = fullContent.slice(0, nextLength)
  lastRevealTimestamp = timestamp

  if (displayedContent.value.length < fullContent.length) {
    revealFrameId = window.requestAnimationFrame(revealNextFrame)
  }
}

/**
 * 确保流式内容显示循环已启动
 */
function ensureRevealLoop(): void {
  if (revealFrameId === null) {
    revealFrameId = window.requestAnimationFrame(revealNextFrame)
  }
}

watch(
  () => [props.message.role, props.message.content, props.message.isStreaming] as const,
  ([role, content, isStreaming]) => {
    if (role !== 'assistant') {
      stopRevealLoop()
      displayedContent.value = content
      lastRevealTimestamp = 0
      return
    }

    if (!isStreaming) {
      stopRevealLoop()
      displayedContent.value = content
      lastRevealTimestamp = 0
      return
    }

    if (displayedContent.value.length > content.length) {
      displayedContent.value = content
    }

    if (!displayedContent.value && content.length > 0) {
      displayedContent.value = content.slice(0, Math.min(content.length, STREAM_REVEAL_MIN_CHARS))
      lastRevealTimestamp = 0
    }

    if (displayedContent.value.length < content.length) {
      ensureRevealLoop()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopRevealLoop()
})

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
 * 是否显示消息元信息行
 */
const showMetaRow = computed(() => {
  return (
    (props.message.role === 'assistant' && !props.message.isStreaming && !!props.message.usage) ||
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
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
        <span v-if="showTimestamp" class="sender-time">{{ formattedTime }}</span>
        <span v-if="hasStructuredReact" class="thinking-indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          分阶段推理
        </span>
        <span v-else-if="showStandaloneReasoning" class="thinking-indicator">
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

      <!-- 文档指示器（仅用户消息） -->
      <div
        v-if="message.attachedDocuments && message.attachedDocuments.length > 0"
        class="document-indicators"
      >
        <div v-for="(doc, index) in message.attachedDocuments" :key="index" class="doc-badge">
          <svg
            class="doc-icon"
            width="14"
            height="14"
            viewBox="0 0 1024 1024"
            :style="{ color: getFileTypeIcon(doc.fileName).color }"
          >
            <path :d="getFileTypeIcon(doc.fileName).path" fill="currentColor" />
          </svg>
          <span class="doc-name" :title="doc.fileName">{{ doc.fileName }}</span>
          <span class="doc-size">{{ formatFileSize(doc.fileSize) }}</span>
        </div>
      </div>

      <!-- 图片指示器（仅用户消息） -->
      <div
        v-if="message.attachedImages && message.attachedImages.length > 0"
        class="image-indicators"
      >
        <div v-for="(img, index) in message.attachedImages" :key="index" class="image-badge">
          <img :src="img.base64Data" :alt="img.fileName" class="msg-image-thumb" />
          <span class="image-badge-name" :title="img.fileName">{{ img.fileName }}</span>
        </div>
      </div>

      <!-- 消息气泡 -->
      <div class="message-bubble" :class="{ streaming: message.isStreaming }">
        <!-- 用户消息：纯文本 -->
        <template v-if="message.role === 'user'">
          <span class="message-text">{{ message.content }}</span>
        </template>

        <!-- AI 消息：Markdown 渲染 -->
        <template v-else>
          <div
            class="markdown-body"
            :class="{ 'streaming-content': message.isStreaming }"
            v-html="renderedMarkdown"
          ></div>
        </template>
      </div>

      <!-- 消息元信息行：Token统计、反馈按钮 -->
      <Transition name="meta-fade">
        <div v-if="showMetaRow" class="message-meta-row">
          <!-- Token 统计（用户消息估算 / AI 消息真实值） -->
          <div v-if="message.role === 'user' && !message.isStreaming" class="token-usage">
            {{ userTokenUsageLabel }}
          </div>

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

/* 用户消息文本 */
.message-text {
  white-space: pre-wrap;
}

/* 消息元信息行：时间戳、Token统计、反馈按钮 */
.message-meta-row {
  display: flex;
  align-items: center;
  align-self: flex-start;
  flex-wrap: wrap;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  margin-top: 4px;
  min-height: calc(11px + 8px + 2px); /* font-size + padding-top/bottom + border */
}

.chat-message.role-user .message-meta-row {
  align-self: flex-end;
}

/* Token 统计样式 */
.token-usage {
  padding: 4px 8px;
  font-size: 11px;
  color: var(--theme-text-tertiary);
  background: linear-gradient(
    135deg,
    var(--glass-white-05, rgba(255, 255, 255, 0.05)) 0%,
    var(--glass-white-027, rgba(255, 255, 255, 0.027)) 100%
  );
  border: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
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
  background-color: var(--glass-white-08, rgba(255, 255, 255, 0.08));
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: var(--theme-font-mono, 'JetBrains Mono', 'Fira Code', monospace);
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  background:
    linear-gradient(
      135deg,
      var(--glass-white-03, rgba(255, 255, 255, 0.03)) 0%,
      var(--glass-white-017, rgba(255, 255, 255, 0.017)) 100%
    ),
    var(--theme-bg);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 12px 16px;
  border-radius: var(--theme-radius);
  overflow-x: auto;
  margin: 0.75em 0;
  border: 1px solid var(--glass-white-08, rgba(255, 255, 255, 0.08));
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

/* 流式内容平滑显示 */
.streaming-content {
  opacity: 0.98;
  transition: opacity 0.18s ease-out;
}

/* ==================== 文档指示器样式 ==================== */
.document-indicators {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 4px;
}

.doc-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.12) 0%, rgba(70, 170, 143, 0.05) 100%);
  border: 1px solid rgba(70, 170, 143, 0.25);
  border-radius: var(--theme-radius-sm, 6px);
  font-size: 12px;
  color: var(--theme-text);
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.doc-badge:hover {
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.18) 0%, rgba(70, 170, 143, 0.08) 100%);
  border-color: rgba(70, 170, 143, 0.35);
}

.doc-icon {
  flex-shrink: 0;
  color: var(--theme-accent);
}

.doc-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.doc-size {
  font-size: 10px;
  color: var(--theme-text-tertiary);
  opacity: 0.8;
}

/* ==================== 图片指示器样式 ==================== */
.image-indicators {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 4px;
}

.image-badge {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.12) 0%, rgba(70, 170, 143, 0.05) 100%);
  border: 1px solid rgba(70, 170, 143, 0.25);
  border-radius: var(--theme-radius-sm, 6px);
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.image-badge:hover {
  background: linear-gradient(135deg, rgba(70, 170, 143, 0.18) 0%, rgba(70, 170, 143, 0.08) 100%);
  border-color: rgba(70, 170, 143, 0.35);
}

.msg-image-thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.1);
}

.image-badge-name {
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 500;
  color: var(--theme-text);
  text-align: center;
}
</style>
