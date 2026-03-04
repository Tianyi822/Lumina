<script setup lang="ts">
import { nextTick, onMounted, ref, watch, provide, computed } from 'vue'
import ChatMessage from './chat/ChatMessage.vue'
import MessageInput from './MessageInput.vue'
import ReActSteps from './ReActSteps.vue'
import type { Message, MCPTool, KnowledgeBase, AttachedDocument } from '@renderer/types'

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
    attachedDocuments: AttachedDocument[]
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

function handleSendMessage(
  message: string,
  model: string,
  selectedTools: MCPTool[],
  selectedKnowledgeBases: KnowledgeBase[],
  enableSandboxTools: boolean,
  attachedDocuments: AttachedDocument[]
): void {
  window.api.logger.debug('[MainContent] 处理发送消息事件', {
    messageLength: message.length,
    model,
    selectedToolsCount: selectedTools?.length ?? 0,
    selectedKnowledgeBasesCount: selectedKnowledgeBases?.length ?? 0,
    enableSandboxTools,
    attachedDocumentsCount: attachedDocuments?.length ?? 0
  })
  emit(
    'send-message',
    message,
    model,
    selectedTools,
    selectedKnowledgeBases,
    enableSandboxTools,
    attachedDocuments
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
        <ChatMessage
          v-for="msg in (messages ?? []).filter((m) => m.role !== 'tool')"
          :key="msg.id"
          :message="msg"
          :current-model-name="props.currentModelName"
          :is-reasoning-expanded="isReasoningExpanded(msg.id)"
          :current-chat-id="currentChatId"
          @toggle-reasoning="toggleReasoning"
        >
          <!-- ReAct 步骤插槽 -->
          <template #react-steps>
            <ReActSteps
              v-if="msg.role === 'assistant' && msg.reactSteps && msg.reactSteps.length > 0"
              :steps="msg.reactSteps"
              :is-streaming="msg.isStreaming"
            />
          </template>
        </ChatMessage>

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
  overflow-x: hidden;
  padding: 24px;
  background: linear-gradient(
    180deg,
    var(--theme-bg) 0%,
    var(--glass-white-007, rgba(255, 255, 255, 0.007)) 50%,
    var(--theme-bg) 100%
  );
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-text {
  color: var(--theme-text-tertiary);
  font-size: 15px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: var(--theme-spacing-lg);
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
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

.terminal-prompt {
  color: var(--theme-accent);
  font-family: var(--theme-font-mono, monospace);
}

.terminal-prompt::before {
  content: '❯ ';
  color: var(--theme-accent-secondary);
}

.terminal-cursor {
  display: inline-block;
  width: 8px;
  height: 18px;
  background-color: var(--theme-accent);
  margin-left: 2px;
  animation: cursor-blink 1s step-end infinite;
}

@keyframes cursor-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
</style>
