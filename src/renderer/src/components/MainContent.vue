<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { nextTick, onMounted, ref, watch } from 'vue'
import MessageInput from './MessageInput.vue'
import ReActSteps from './ReActSteps.vue'
import type { Message, MCPTool, TokenUsage, KnowledgeBase } from '@renderer/types'

// 初始化 markdown-it 实例
const md = new MarkdownIt({
  html: false, // 禁用 HTML 标签
  breaks: true, // 将换行符转换为 <br>
  linkify: true, // 自动将 URL 转换为链接
  typographer: true // 启用排版优化
})

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
}>()

const emit = defineEmits<{
  (
    e: 'send-message',
    message: string,
    model: string,
    selectedTools: MCPTool[],
    selectedKnowledgeBases: KnowledgeBase[],
    enableSandboxTools: boolean
  ): void
  (e: 'stop-request'): void
  (e: 'update:inputMessage', value: string): void
  (e: 'update:selectedModel', value: string): void
  (e: 'update:selectedMCPTools', value: MCPTool[]): void
  (e: 'update:selectedKnowledgeBases', value: KnowledgeBase[]): void
  (e: 'update:enableSandboxTools', value: boolean): void
}>()

// 展开的思考内容消息ID集合
const expandedReasoningIds = ref<Set<string>>(new Set())

// 消息区域引用
const messagesAreaRef = ref<HTMLElement | null>(null)

// 用户是否正在手动滚动（不在底部）
const userScrolling = ref(false)

// 滚动阈值：距离底部多少像素内认为是"在底部"
const SCROLL_THRESHOLD = 100

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
 * 处理滚动事件
 */
function handleScroll(): void {
  userScrolling.value = !isNearBottom()
}

/**
 * 智能滚动：仅在用户位于底部附近时自动滚动
 */
function smartScrollToBottom(): void {
  if (!userScrolling.value) {
    nextTick(() => {
      scrollToBottom(true)
    })
  }
}

// 监听消息变化，智能滚动
watch(
  () => props.messages,
  () => {
    smartScrollToBottom()
  },
  { deep: true }
)

// 监听流式输出状态，开始时滚动到底部
watch(
  () => props.isSending,
  (sending) => {
    if (sending) {
      // 开始发送时，重置滚动状态并滚动到底部
      userScrolling.value = false
      nextTick(() => {
        scrollToBottom(false)
      })
    }
  }
)

// 监听对话切换，滚动到底部
watch(
  () => props.currentChatId,
  () => {
    userScrolling.value = false
    nextTick(() => {
      scrollToBottom(false)
    })
  }
)

onMounted(() => {
  // 初始滚动到底部
  scrollToBottom(false)
})

/**
 * 渲染 Markdown 内容
 */
function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}

function handleSendMessage(
  message: string,
  model: string,
  selectedTools: MCPTool[],
  selectedKnowledgeBases: KnowledgeBase[],
  enableSandboxTools: boolean
): void {
  window.api.logger.debug('[MainContent] 处理发送消息事件', {
    messageLength: message.length,
    model,
    selectedToolsCount: selectedTools?.length ?? 0,
    selectedKnowledgeBasesCount: selectedKnowledgeBases?.length ?? 0,
    enableSandboxTools
  })
  emit('send-message', message, model, selectedTools, selectedKnowledgeBases, enableSandboxTools)
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
 * 格式化 Token 统计
 */
function formatTokenUsage(usage: TokenUsage): string {
  let result = `输入: ${usage.prompt_tokens} | 输出: ${usage.completion_tokens} | 总计: ${usage.total_tokens}`
  if (usage.reasoning_tokens) {
    result += ` | 思考: ${usage.reasoning_tokens}`
  }
  return result
}
</script>

<template>
  <main class="main-content">
    <!-- 消息区域 -->
    <div ref="messagesAreaRef" class="messages-area" @scroll="handleScroll">
      <!-- 空状态 -->
      <div v-if="!currentChatId" class="empty-state">
        <p class="empty-text">选择或创建一个对话开始</p>
      </div>

      <!-- 消息列表 -->
      <div v-else class="messages-list">
        <div
          v-for="msg in (messages ?? []).filter((m) => m.role !== 'tool')"
          :key="msg.id"
          class="message"
          :class="msg.role"
        >
          <!-- 消息头部：角色标签 -->
          <div class="message-header">
            <!-- 用户标签 -->
            <div v-if="msg.role === 'user'" class="message-label user-label">
              <span class="label-text">用户</span>
            </div>
            <!-- 模型标签 -->
            <div v-else class="message-label model-label">
              <span class="label-text">{{ msg.modelName || props.currentModelName || 'AI' }}</span>
              <!-- 思考模式标识 -->
              <span v-if="msg.reasoning" class="thinking-badge">思考</span>
            </div>
          </div>

          <!-- 思考内容（可折叠） -->
          <div v-if="msg.reasoning" class="reasoning-section">
            <button class="reasoning-toggle" @click="toggleReasoning(msg.id)">
              <span class="reasoning-icon">{{ isReasoningExpanded(msg.id) ? '▼' : '▶' }}</span>
              <span class="reasoning-label">思考过程</span>
            </button>
            <div v-if="isReasoningExpanded(msg.id)" class="reasoning-content">
              <!-- eslint-disable-next-line vue/no-v-html -- markdown-it 已配置 html: false，禁用原始 HTML -->
              <div class="markdown-body" v-html="renderMarkdown(msg.reasoning)"></div>
            </div>
          </div>

          <!-- ReAct 推理步骤（仅助手消息） -->
          <ReActSteps
            v-if="msg.role === 'assistant' && msg.reactSteps && msg.reactSteps.length > 0"
            :steps="msg.reactSteps"
            :is-streaming="msg.isStreaming"
          />

          <!-- 消息内容 -->
          <div class="message-content" :class="{ streaming: msg.isStreaming }">
            <!-- 用户消息：纯文本显示 -->
            <span v-if="msg.role === 'user'" class="user-message">{{ msg.content }}</span>
            <!-- 助手消息：Markdown 渲染 -->
            <div v-else class="assistant-message">
              <!-- eslint-disable-next-line vue/no-v-html -- markdown-it 已配置 html: false，禁用原始 HTML -->
              <div class="markdown-body" v-html="renderMarkdown(msg.content)"></div>
              <span v-if="msg.isStreaming" class="streaming-cursor">▊</span>
            </div>
          </div>

          <!-- Token 统计（仅助手消息） -->
          <div v-if="msg.role === 'assistant' && msg.usage && !msg.isStreaming" class="token-usage">
            {{ formatTokenUsage(msg.usage) }}
          </div>
        </div>

        <div v-if="!messages || messages.length === 0" class="empty-chat">
          <div class="command-line">
            <span class="terminal-prompt">开始新对话</span>
            <span class="terminal-cursor"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <!-- 使用 :key 绑定 currentChatId 确保切换会话时输入组件完全重新创建 -->
    <MessageInput
      :key="props.currentChatId || 'no-chat-input'"
      :is-sending="props.isSending"
      :input-message="props.inputMessage"
      :selected-model="props.selectedModel"
      :selected-m-c-p-tools="props.selectedMCPTools"
      :selected-knowledge-bases="props.selectedKnowledgeBases"
      :enable-sandbox-tools="props.enableSandboxTools"
      @send="handleSendMessage"
      @stop="handleStopRequest"
      @update:input-message="handleUpdateInputMessage"
      @update:selected-model="handleUpdateSelectedModel"
      @update:selected-m-c-p-tools="handleUpdateSelectedTools"
      @update:selected-knowledge-bases="handleUpdateSelectedKnowledgeBases"
      @update:enable-sandbox-tools="handleUpdateEnableSandboxTools"
    />
  </main>
</template>

<style scoped>
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--theme-bg);
  overflow: hidden;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;

  /* 滚动条样式 */
  &::-webkit-scrollbar {
    width: var(--scrollbar-width, 8px);
  }

  &::-webkit-scrollbar-track {
    background: var(--scrollbar-track-bg, transparent);
    border-radius: var(--scrollbar-thumb-radius, 4px);
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb-bg, #30363d);
    border-radius: var(--scrollbar-thumb-radius, 4px);
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover-bg, #484f58);
  }
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-text {
  color: var(--theme-text-secondary);
  font-size: 15px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.message {
  max-width: 85%;
  display: flex;
  flex-direction: column;
}

/* 用户消息：右侧对齐 */
.message.user {
  align-self: flex-end;
}

.message.user .message-header {
  display: flex;
  justify-content: flex-end;
}

/* 助手消息：左侧对齐 */
.message.assistant {
  align-self: flex-start;
}

/* 消息头部：角色标签 */
.message-header {
  margin-bottom: 6px;
}

.message-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.label-text {
  color: inherit;
}

/* 用户标签样式 */
.user-label {
  background-color: rgba(63, 185, 80, 0.15);
  color: var(--theme-accent);
  border: 1px solid rgba(63, 185, 80, 0.3);
}

/* 模型标签样式 */
.model-label {
  background-color: rgba(88, 166, 255, 0.15);
  color: var(--theme-accent-secondary);
  border: 1px solid rgba(88, 166, 255, 0.3);
}

/* 思考模式标识 */
.thinking-badge {
  margin-left: 6px;
  padding: 2px 6px;
  background-color: rgba(210, 153, 34, 0.2);
  color: var(--theme-warning);
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
}

/* 思考内容样式 */
.reasoning-section {
  margin-bottom: 8px;
}

.reasoning-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.reasoning-toggle:hover {
  background-color: var(--theme-bg-hover);
}

.reasoning-icon {
  font-size: 10px;
}

.reasoning-label {
  font-weight: 500;
}

.reasoning-content {
  margin-top: 8px;
  padding: 12px;
  background-color: var(--theme-bg-hover);
  border: 1px dashed var(--theme-border);
  border-radius: var(--theme-radius);
  font-size: 12px;
  color: var(--theme-text-secondary);
  overflow-x: auto;
}

.message-content {
  padding: 12px 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  font-size: 14px;
  line-height: 1.6;
}

.message-content.streaming {
  border-color: var(--theme-accent-secondary);
  box-shadow: 0 0 0 1px rgba(88, 166, 255, 0.2);
}

/* 用户消息样式 */
.message.user .message-content {
  background-color: rgba(63, 185, 80, 0.15);
  border-color: rgba(63, 185, 80, 0.3);
}

/* 助手消息样式 */
.message.assistant .message-content {
  background-color: var(--theme-bg-secondary);
  border-color: rgba(88, 166, 255, 0.4);
}

.user-message {
  white-space: pre-wrap;
  word-break: break-word;
}

.assistant-message {
  position: relative;
}

/* 流式输出光标 */
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

/* Token 统计样式 */
.token-usage {
  margin-top: 6px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--theme-text-secondary);
  background-color: var(--theme-bg-hover);
  border-radius: 4px;
  display: inline-block;
}

.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
}

.command-line {
  display: flex;
  align-items: center;
}

/* Markdown 内容样式 */
.markdown-body {
  color: var(--theme-text);
  word-break: break-word;
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
.markdown-body :deep(h3:first-child),
.markdown-body :deep(h4:first-child),
.markdown-body :deep(h5:first-child),
.markdown-body :deep(h6:first-child) {
  margin-top: 0;
}

.markdown-body :deep(h1) {
  font-size: 1.5em;
}

.markdown-body :deep(h2) {
  font-size: 1.3em;
}

.markdown-body :deep(h3) {
  font-size: 1.15em;
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
  background-color: var(--theme-bg-hover);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
  font-size: 0.9em;
}

.markdown-body :deep(pre) {
  background-color: var(--theme-bg-hover);
  padding: 12px 16px;
  border-radius: var(--theme-radius);
  overflow-x: auto;
  margin: 0.75em 0;
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
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.markdown-body :deep(blockquote p) {
  margin: 0;
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
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--theme-border);
  padding: 8px 12px;
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: var(--theme-bg-hover);
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

.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--theme-radius);
}
</style>
