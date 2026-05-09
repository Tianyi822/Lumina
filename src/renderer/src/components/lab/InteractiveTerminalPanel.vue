<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import type { IDisposable } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { labApi } from '@renderer/services/labApi'
import type { DockerTerminalDataEvent, DockerTerminalExitEvent } from '@renderer/types/lab'
import type { SshTerminalDataEvent, SshTerminalExitEvent } from '@shared/types/lab'

type TerminalBackend = 'docker' | 'ssh'
type TerminalStatus = 'opening' | 'connected' | 'closed' | 'error'

interface TerminalSize {
  cols: number
  rows: number
}

const props = defineProps<{
  backend: TerminalBackend
  targetId: string
  title: string
  subtitle?: string
}>()

const terminalHostRef = ref<HTMLDivElement | null>(null)
const sessionId = ref<string | null>(null)
const status = ref<TerminalStatus>('opening')
const statusMessage = ref('')

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let inputDisposable: IDisposable | null = null
let removeDataListener: (() => void) | null = null
let removeExitListener: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let resizeFrame = 0
let lastSize: TerminalSize | null = null
let disposed = false

const statusLabel = computed(() => {
  const labels: Record<TerminalStatus, string> = {
    opening: '连接中',
    connected: '已连接',
    closed: '已关闭',
    error: '异常'
  }
  return labels[status.value]
})

const statusClass = computed(() => `status-${status.value}`)
const backendLabel = computed(() => (props.backend === 'ssh' ? 'SSH 终端' : 'Docker 终端'))

onMounted(() => {
  void initializeTerminal()
})

onBeforeUnmount(() => {
  disposed = true
  disposeTerminal(true)
})

async function initializeTerminal(): Promise<void> {
  if (!terminalHostRef.value) {
    return
  }

  status.value = 'opening'
  statusMessage.value = ''
  setupTerminal()
  setupListeners()

  await nextTick()
  fitTerminal()

  const result = await openRemoteTerminal(readTerminalSize())
  if (disposed) {
    return
  }

  if (!result.success || !result.sessionId) {
    status.value = 'error'
    statusMessage.value = result.error || '终端打开失败'
    return
  }

  sessionId.value = result.sessionId
  status.value = 'connected'
  statusMessage.value = ''
  terminal?.focus()
  await resizeRemoteTerminal(readTerminalSize())
}

function setupTerminal(): void {
  if (!terminalHostRef.value) {
    return
  }

  terminal = new Terminal({
    cursorBlink: true,
    allowTransparency: true,
    scrollback: 5000,
    fontFamily: readCssVar('--sm-font-mono', 'Menlo, Monaco, Consolas, monospace'),
    fontSize: 13,
    lineHeight: 1.25,
    theme: {
      background: readCssVar('--sm-color-bg-embedded', '#111111'),
      foreground: readCssVar('--sm-color-text-primary', '#f0f0f0'),
      cursor: readCssVar('--sm-color-accent-hover', '#8ab4ff'),
      selectionBackground: readCssVar('--sm-color-accent-18', '#2f5f9f')
    }
  })
  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)
  terminal.open(terminalHostRef.value)
  inputDisposable = terminal.onData((data) => {
    void writeRemoteTerminal(data)
  })

  resizeObserver = new ResizeObserver(() => {
    scheduleFitAndResize()
  })
  resizeObserver.observe(terminalHostRef.value)
}

function setupListeners(): void {
  if (props.backend === 'ssh') {
    removeDataListener = window.api.ssh.terminal.onData((event) => {
      handleSshData(event)
    })
    removeExitListener = window.api.ssh.terminal.onExit((event) => {
      handleSshExit(event)
    })
    return
  }

  removeDataListener = labApi.terminal.onData((event) => {
    handleDockerData(event)
  })
  removeExitListener = labApi.terminal.onExit((event) => {
    handleDockerExit(event)
  })
}

function handleSshData(event: SshTerminalDataEvent): void {
  if (props.backend !== 'ssh' || event.sessionId !== sessionId.value) {
    return
  }
  terminal?.write(event.data)
}

function handleDockerData(event: DockerTerminalDataEvent): void {
  if (props.backend !== 'docker' || event.sessionId !== sessionId.value) {
    return
  }
  terminal?.write(event.data)
}

function handleSshExit(event: SshTerminalExitEvent): void {
  if (props.backend !== 'ssh' || event.sessionId !== sessionId.value) {
    return
  }
  markClosed(event.reason)
}

function handleDockerExit(event: DockerTerminalExitEvent): void {
  if (props.backend !== 'docker' || event.sessionId !== sessionId.value) {
    return
  }
  markClosed(event.reason)
}

function markClosed(reason?: string): void {
  sessionId.value = null
  if (status.value !== 'error') {
    status.value = 'closed'
  }
  statusMessage.value = reason || '终端已关闭'
}

async function openRemoteTerminal(
  size: TerminalSize
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  if (props.backend === 'ssh') {
    return window.api.ssh.terminal.open(props.targetId, size)
  }
  return labApi.terminal.open(props.targetId, size)
}

async function writeRemoteTerminal(data: string): Promise<void> {
  if (!sessionId.value || status.value !== 'connected') {
    return
  }

  const result =
    props.backend === 'ssh'
      ? await window.api.ssh.terminal.write(sessionId.value, data)
      : await labApi.terminal.write(sessionId.value, data)

  if (!result.success) {
    status.value = 'error'
    statusMessage.value = result.error || '终端写入失败'
  }
}

async function resizeRemoteTerminal(size: TerminalSize): Promise<void> {
  if (!sessionId.value || status.value !== 'connected') {
    return
  }

  const result =
    props.backend === 'ssh'
      ? await window.api.ssh.terminal.resize(sessionId.value, size)
      : await labApi.terminal.resize(sessionId.value, size)

  if (!result.success) {
    status.value = 'error'
    statusMessage.value = result.error || '终端尺寸同步失败'
  }
}

async function closeRemoteTerminal(id: string): Promise<void> {
  if (props.backend === 'ssh') {
    await window.api.ssh.terminal.close(id)
    return
  }
  await labApi.terminal.close(id)
}

function scheduleFitAndResize(): void {
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame)
  }

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0
    fitTerminal()
    const size = readTerminalSize()
    if (lastSize && lastSize.cols === size.cols && lastSize.rows === size.rows) {
      return
    }

    lastSize = size
    void resizeRemoteTerminal(size)
  })
}

function fitTerminal(): void {
  try {
    fitAddon?.fit()
  } catch {
    /* xterm 尚未完成首帧测量时可安全忽略 */
  }
}

function readTerminalSize(): TerminalSize {
  return {
    cols: terminal?.cols || 80,
    rows: terminal?.rows || 24
  }
}

function readCssVar(name: string, fallback: string): string {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

async function handleRestart(): Promise<void> {
  disposeTerminal(true)
  disposed = false
  await nextTick()
  await initializeTerminal()
}

function disposeTerminal(closeRemote: boolean): void {
  if (resizeFrame) {
    window.cancelAnimationFrame(resizeFrame)
    resizeFrame = 0
  }

  const currentSessionId = sessionId.value
  sessionId.value = null

  removeDataListener?.()
  removeExitListener?.()
  removeDataListener = null
  removeExitListener = null

  resizeObserver?.disconnect()
  resizeObserver = null

  inputDisposable?.dispose()
  inputDisposable = null

  terminal?.dispose()
  terminal = null
  fitAddon = null
  lastSize = null

  if (closeRemote && currentSessionId) {
    void closeRemoteTerminal(currentSessionId)
  }
}
</script>

<template>
  <section class="sm-interactive-terminal-panel">
    <header class="sm-interactive-terminal-panel__header">
      <div class="sm-interactive-terminal-panel__copy">
        <span class="sm-interactive-terminal-panel__eyebrow">{{ backendLabel }}</span>
        <div class="sm-interactive-terminal-panel__headline">
          <h2>{{ title }}</h2>
          <span class="sm-badge" :class="statusClass">{{ statusLabel }}</span>
        </div>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <button
        v-if="status !== 'opening'"
        class="sm-button sm-button--secondary sm-button--small"
        @click="handleRestart"
      >
        重开终端
      </button>
    </header>

    <div class="sm-interactive-terminal-panel__body">
      <div ref="terminalHostRef" class="sm-interactive-terminal-panel__terminal"></div>
      <div v-if="status !== 'connected'" class="sm-interactive-terminal-panel__overlay">
        <span>{{ statusMessage || statusLabel }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sm-interactive-terminal-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-2);
}

.sm-interactive-terminal-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: var(--sm-space-4) var(--sm-space-5);
  border-bottom: 1px solid var(--sm-color-border-subtle);
  flex-shrink: 0;
}

.sm-interactive-terminal-panel__copy {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
  min-width: 0;
}

.sm-interactive-terminal-panel__eyebrow {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.sm-interactive-terminal-panel__headline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
}

.sm-interactive-terminal-panel__headline h2 {
  margin: 0;
  color: var(--sm-color-text-primary);
  font-size: 17px;
  line-height: 1.25;
}

.sm-interactive-terminal-panel__copy p {
  margin: 0;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.sm-interactive-terminal-panel__body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--sm-color-bg-embedded);
}

.sm-interactive-terminal-panel__terminal {
  width: 100%;
  height: 100%;
  padding: var(--sm-space-3);
  box-sizing: border-box;
}

.sm-interactive-terminal-panel__overlay {
  position: absolute;
  inset: auto var(--sm-space-4) var(--sm-space-4) var(--sm-space-4);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: color-mix(in srgb, var(--sm-color-surface-2) 88%, transparent);
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  pointer-events: none;
}

:deep(.xterm) {
  height: 100%;
}

:deep(.xterm-viewport) {
  background: transparent !important;
}

.status-connected {
  border-color: rgba(127, 176, 138, 0.28);
  background: rgba(127, 176, 138, 0.08);
  color: #7fb08a;
}

.status-opening {
  border-color: var(--sm-color-accent-28);
  background: var(--sm-color-accent-08);
  color: var(--sm-color-accent-hover);
}

.status-closed {
  border-color: var(--sm-color-border-default);
  background: rgba(255, 255, 255, 0.04);
  color: var(--sm-color-text-secondary);
}

.status-error {
  border-color: rgba(199, 120, 120, 0.28);
  background: rgba(199, 120, 120, 0.08);
  color: #c77878;
}

@media (max-width: 820px) {
  .sm-interactive-terminal-panel__header {
    flex-direction: column;
  }
}
</style>
