<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { TerminalLog } from '@shared/types/sandbox'

// ==================== Props & Emits ====================

const props = defineProps<{
  containerId: string
  containerName: string
  logs: TerminalLog[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'execute', command: string): void
  (e: 'clear'): void
}>()

// ==================== State ====================

const commandInput = ref('')
const logsContainerRef = ref<HTMLDivElement | null>(null)
const autoScroll = ref(true)

// 快捷命令
const quickCommands = [
  { label: 'ls -la', command: 'ls -la' },
  { label: 'pwd', command: 'pwd' },
  { label: 'whoami', command: 'whoami' },
  { label: 'env', command: 'env' },
  { label: 'ps aux', command: 'ps aux' },
  { label: 'df -h', command: 'df -h' },
  { label: 'free -m', command: 'free -m' },
  { label: 'cat /etc/os-release', command: 'cat /etc/os-release' }
]

// ==================== Computed ====================

const hasLogs = computed(() => props.logs.length > 0)

// ==================== Watch ====================

watch(
  () => props.logs.length,
  async () => {
    if (autoScroll.value) {
      await nextTick()
      scrollToBottom()
    }
  }
)

// ==================== Methods ====================

function scrollToBottom(): void {
  if (logsContainerRef.value) {
    logsContainerRef.value.scrollTop = logsContainerRef.value.scrollHeight
  }
}

function handleExecute(): void {
  const command = commandInput.value.trim()
  if (!command) return

  emit('execute', command)
  commandInput.value = ''
}

function handleClear(): void {
  emit('clear')
}

function useQuickCommand(command: string): void {
  commandInput.value = command
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function getLogClass(type: TerminalLog['type']): string {
  return `log-${type}`
}

function getLogPrefix(type: TerminalLog['type']): string {
  switch (type) {
    case 'input':
      return '$'
    case 'output':
      return '>'
    case 'error':
      return 'x'
    default:
      return '>'
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleExecute()
  }
}
</script>

<template>
  <div class="terminal-panel">
    <!-- 头部信息 -->
    <div class="terminal-header">
      <div class="container-info">
        <span class="info-label">容器:</span>
        <span class="info-value">{{ containerName }}</span>
        <span class="info-divider">|</span>
        <span class="info-label">ID:</span>
        <span class="info-value">{{ containerId.substring(0, 12) }}</span>
      </div>
      <div class="terminal-actions">
        <label class="auto-scroll-toggle">
          <input v-model="autoScroll" type="checkbox" />
          <span>自动滚动</span>
        </label>
        <button class="btn-sm" @click="handleClear">清空</button>
      </div>
    </div>

    <!-- 日志输出区域 -->
    <div ref="logsContainerRef" class="terminal-output">
      <div v-if="!hasLogs" class="empty-logs">
        <p>在下方输入命令开始执行</p>
        <p class="empty-hint">支持常见 Shell 命令</p>
      </div>

      <div v-else class="log-list">
        <div
          v-for="(log, index) in logs"
          :key="index"
          class="log-entry"
          :class="getLogClass(log.type)"
        >
          <span class="log-time">[{{ formatTime(log.timestamp) }}]</span>
          <span class="log-prefix">{{ getLogPrefix(log.type) }}</span>
          <pre class="log-content">{{ log.content }}</pre>
        </div>
      </div>

      <!-- 执行中指示器 -->
      <div v-if="loading" class="loading-indicator">
        <span class="loading-dots">执行中</span>
      </div>
    </div>

    <!-- 命令输入区域 -->
    <div class="terminal-input-section">
      <div class="input-wrapper">
        <span class="input-prompt">$</span>
        <input
          v-model="commandInput"
          type="text"
          class="terminal-input"
          placeholder="输入命令..."
          :disabled="loading"
          @keydown="handleKeydown"
        />
        <button
          class="execute-btn"
          :disabled="!commandInput.trim() || loading"
          @click="handleExecute"
        >
          执行
        </button>
      </div>
    </div>

    <!-- 快捷命令 -->
    <div class="quick-commands">
      <span class="quick-label">快捷命令:</span>
      <div class="quick-list">
        <button
          v-for="cmd in quickCommands"
          :key="cmd.command"
          class="quick-btn"
          :disabled="loading"
          @click="useQuickCommand(cmd.command)"
        >
          {{ cmd.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.terminal-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  overflow: hidden;
}

/* 头部 */
.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: var(--theme-bg);
  border-bottom: 1px solid var(--theme-border);
}

.container-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.info-label {
  color: var(--theme-text-secondary);
}

.info-value {
  color: var(--theme-text);
  font-weight: 500;
}

.info-divider {
  color: var(--theme-border);
  margin: 0 4px;
}

.terminal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auto-scroll-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--theme-text-secondary);
  cursor: pointer;
}

.auto-scroll-toggle input {
  margin: 0;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  font-family: var(--theme-font);
  background-color: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-sm:hover {
  border-color: var(--theme-text);
  color: var(--theme-text);
}

/* 输出区域 */
.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-family: var(--theme-font);
  font-size: 13px;
  line-height: 1.5;
  background-color: #0d1117;
}

.empty-logs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--theme-text-secondary);
  text-align: center;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 8px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-entry {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  word-break: break-word;
}

.log-time {
  color: #8b949e;
  flex-shrink: 0;
}

.log-prefix {
  flex-shrink: 0;
  font-weight: 600;
}

.log-input .log-prefix {
  color: #58a6ff;
}

.log-output .log-prefix {
  color: #3fb950;
}

.log-error .log-prefix {
  color: #f85149;
}

.log-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: #c9d1d9;
  font-family: inherit;
  font-size: inherit;
  flex: 1;
}

.log-input .log-content {
  color: #58a6ff;
}

.log-error .log-content {
  color: #f85149;
}

/* 加载指示器 */
.loading-indicator {
  padding: 8px 0;
  color: #8b949e;
  font-style: italic;
}

.loading-dots::after {
  content: '';
  animation: dots 1.5s steps(4, end) infinite;
}

@keyframes dots {
  0%,
  20% {
    content: '';
  }
  40% {
    content: '.';
  }
  60% {
    content: '..';
  }
  80%,
  100% {
    content: '...';
  }
}

/* 输入区域 */
.terminal-input-section {
  padding: 12px 16px;
  background-color: var(--theme-bg);
  border-top: 1px solid var(--theme-border);
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: #0d1117;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 8px 12px;
}

.input-prompt {
  color: #3fb950;
  font-weight: 600;
  font-family: var(--theme-font);
}

.terminal-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #c9d1d9;
  font-family: var(--theme-font);
  font-size: 14px;
}

.terminal-input::placeholder {
  color: #6e7681;
}

.terminal-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.execute-btn {
  padding: 6px 16px;
  font-size: 13px;
  font-family: var(--theme-font);
  font-weight: 500;
  background-color: var(--theme-accent);
  border: none;
  border-radius: 4px;
  color: var(--theme-bg);
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.execute-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.execute-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 快捷命令 */
.quick-commands {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: var(--theme-bg);
  border-top: 1px solid var(--theme-border);
  overflow-x: auto;
}

.quick-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.quick-list {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.quick-btn {
  padding: 4px 10px;
  font-size: 11px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.quick-btn:hover:not(:disabled) {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

.quick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
