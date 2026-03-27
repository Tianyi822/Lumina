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
    <div class="terminal-header">
      <div class="terminal-header__copy">
        <span class="terminal-header__eyebrow">交互终端</span>
        <div class="terminal-header__headline">
          <h2>{{ containerName }}</h2>
          <span class="sm-badge terminal-id">{{ containerId.substring(0, 12) }}</span>
        </div>
        <p>直接向容器发送 Shell 命令，用于巡检、诊断和临时操作。</p>
      </div>
      <div class="terminal-actions">
        <label class="auto-scroll-toggle">
          <input v-model="autoScroll" type="checkbox" />
          <span>自动滚动</span>
        </label>
        <button class="sm-button sm-button--secondary sm-button--small" @click="handleClear">
          清空
        </button>
      </div>
    </div>

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

      <div v-if="loading" class="loading-indicator">
        <span class="loading-dots">执行中</span>
      </div>
    </div>

    <div class="terminal-input-section">
      <div class="input-caption">
        <span>Shell</span>
        <span>Enter 执行</span>
      </div>
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
          class="sm-button sm-button--primary execute-btn"
          :disabled="!commandInput.trim() || loading"
          @click="handleExecute"
        >
          执行
        </button>
      </div>
    </div>

    <div class="quick-commands">
      <span class="quick-label">快捷命令</span>
      <div class="quick-list">
        <button
          v-for="cmd in quickCommands"
          :key="cmd.command"
          class="sm-terminal-panel__quick-button"
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
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  overflow: hidden;
}

.terminal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: var(--sm-space-5);
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.terminal-header__copy {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.terminal-header__eyebrow {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.terminal-header__headline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
}

.terminal-header__headline h2 {
  margin: 0;
  font-size: 18px;
  color: var(--sm-color-text-primary);
}

.terminal-header__copy p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.terminal-id {
  font-family: var(--sm-font-mono);
}

.terminal-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sm-space-3);
}

.auto-scroll-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
}

.auto-scroll-toggle input {
  margin: 0;
  accent-color: var(--sm-color-accent);
}

.terminal-output {
  flex: 1;
  overflow-y: auto;
  padding: var(--sm-space-5);
  font-family: var(--sm-font-mono);
  font-size: 13px;
  line-height: 1.6;
  background: var(--sm-color-bg-embedded);
}

.empty-logs {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--sm-color-text-secondary);
  text-align: center;
}

.empty-hint {
  font-size: 12px;
  margin-top: 8px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-entry {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 8px;
  padding: 6px 0;
  word-break: break-word;
  align-items: start;
}

.log-time {
  color: var(--sm-color-text-tertiary);
  flex-shrink: 0;
}

.log-prefix {
  flex-shrink: 0;
  font-weight: 600;
}

.log-input .log-prefix {
  color: var(--sm-color-accent-hover);
}

.log-output .log-prefix {
  color: #7fb08a;
}

.log-error .log-prefix {
  color: #c77878;
}

.log-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--sm-color-text-primary);
  font-family: inherit;
  font-size: inherit;
  flex: 1;
}

.log-input .log-content {
  color: var(--sm-color-accent-hover);
}

.log-error .log-content {
  color: #c77878;
}

.loading-indicator {
  padding: 8px 0;
  color: var(--sm-color-text-secondary);
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

.terminal-input-section {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
  padding: var(--sm-space-4) var(--sm-space-5);
  border-top: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-1);
}

.input-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--sm-color-bg-embedded);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  padding: 8px 12px;
}

.input-prompt {
  color: #7fb08a;
  font-weight: 600;
  font-family: var(--sm-font-mono);
}

.terminal-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--sm-color-text-primary);
  font-family: var(--sm-font-mono);
  font-size: 14px;
}

.terminal-input::placeholder {
  color: var(--sm-color-text-tertiary);
}

.terminal-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.execute-btn {
  min-width: 64px;
}

.execute-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.quick-commands {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  padding: var(--sm-space-4) var(--sm-space-5);
  background: var(--sm-color-surface-1);
  border-top: 1px solid var(--sm-color-border-subtle);
  overflow-x: auto;
}

.quick-label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.quick-list {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.sm-terminal-panel__quick-button {
  min-height: 28px;
  padding: 0 10px;
  font-size: 11px;
  font-family: var(--sm-font-mono);
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.sm-terminal-panel__quick-button:hover:not(:disabled) {
  background: rgba(142, 149, 217, 0.08);
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-text-primary);
}

.sm-terminal-panel__quick-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 820px) {
  .terminal-header,
  .quick-commands {
    flex-direction: column;
    align-items: flex-start;
  }

  .terminal-actions,
  .quick-list {
    width: 100%;
  }
}
</style>
