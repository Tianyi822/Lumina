<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { TerminalLog } from '@renderer/types/lab'
import styles from './TerminalPanel.module.css'

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
  <div :class="styles['terminal-panel']">
    <div :class="styles['terminal-header']">
      <div :class="styles['terminal-header__copy']">
        <span :class="styles['terminal-header__eyebrow']">交互终端</span>
        <div :class="styles['terminal-header__headline']">
          <h2>{{ containerName }}</h2>
          <span :class="[styles['terminal-id']]">{{ containerId.substring(0, 12) }}</span>
        </div>
        <p>直接向容器发送 Shell 命令，用于巡检、诊断和临时操作。</p>
      </div>
      <div :class="styles['terminal-actions']">
        <label :class="styles['auto-scroll-toggle']">
          <input v-model="autoScroll" type="checkbox" />
          <span>自动滚动</span>
        </label>
        <button class="sm-button sm-button--secondary sm-button--small" @click="handleClear">
          清空
        </button>
      </div>
    </div>

    <div ref="logsContainerRef" :class="styles['terminal-output']">
      <div v-if="!hasLogs" :class="styles['empty-logs']">
        <p>在下方输入命令开始执行</p>
        <p :class="styles['empty-hint']">支持常见 Shell 命令</p>
      </div>

      <div v-else :class="styles['log-list']">
        <div
          v-for="(log, index) in logs"
          :key="index"
          :class="[styles['log-entry'], styles[getLogClass(log.type)]]"
        >
          <span :class="styles['log-time']">[{{ formatTime(log.timestamp) }}]</span>
          <span :class="styles['log-prefix']">{{ getLogPrefix(log.type) }}</span>
          <pre :class="styles['log-content']">{{ log.content }}</pre>
        </div>
      </div>

      <div v-if="loading" :class="styles['loading-indicator']">
        <span :class="styles['loading-dots']">执行中</span>
      </div>
    </div>

    <div :class="styles['terminal-input-section']">
      <div :class="styles['input-caption']">
        <span>Shell</span>
        <span>Enter 执行</span>
      </div>
      <div :class="styles['input-wrapper']">
        <span :class="styles['input-prompt']">$</span>
        <input
          v-model="commandInput"
          type="text"
          :class="styles['terminal-input']"
          placeholder="输入命令..."
          :disabled="loading"
          @keydown="handleKeydown"
        />
        <button
          :class="[styles['execute-btn']]"
          :disabled="!commandInput.trim() || loading"
          @click="handleExecute"
        >
          执行
        </button>
      </div>
    </div>

    <div :class="styles['quick-commands']">
      <span :class="styles['quick-label']">快捷命令</span>
      <div :class="styles['quick-list']">
        <button
          v-for="cmd in quickCommands"
          :key="cmd.command"
          :class="styles['sm-terminal-panel__quick-button']"
          :disabled="loading"
          @click="useQuickCommand(cmd.command)"
        >
          {{ cmd.label }}
        </button>
      </div>
    </div>
  </div>
</template>
