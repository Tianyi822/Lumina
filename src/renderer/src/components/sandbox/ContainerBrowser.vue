<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ContainerInfo, ContainerState } from '@shared/types/sandbox'

// ==================== Props & Emits ====================

const props = defineProps<{
  containers: ContainerInfo[]
  selectedContainerId?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', containerId: string): void
  (e: 'refresh'): void
  (e: 'start', containerId: string): void
  (e: 'stop', containerId: string): void
  (e: 'restart', containerId: string): void
  (e: 'remove', containerId: string): void
  (e: 'select-as-sandbox', containerId: string): void
  (e: 'open-terminal', containerId: string): void
  (e: 'view-logs', containerId: string): void
  (e: 'filter-change', filter: 'all' | 'running' | 'stopped'): void
  (e: 'search', query: string): void
}>()

// ==================== State ====================

const searchQuery = ref('')
const activeFilter = ref<'all' | 'running' | 'stopped'>('all')

// ==================== Computed ====================

const runningCount = computed(() => props.containers.filter((c) => c.state === 'running').length)
const stoppedCount = computed(
  () => props.containers.filter((c) => c.state === 'exited' || c.state === 'dead').length
)

// ==================== Methods ====================

function getStateLabel(state: ContainerState): string {
  const labels: Record<ContainerState, string> = {
    created: '已创建',
    running: '运行中',
    paused: '已暂停',
    restarting: '重启中',
    removing: '删除中',
    exited: '已停止',
    dead: '已终止'
  }
  return labels[state] || state
}

function getStateClass(state: ContainerState): string {
  return `state-${state}`
}

function formatPorts(ports: ContainerInfo['ports']): string {
  if (!ports || ports.length === 0) return '-'
  return ports
    .filter((p) => p.hostPort)
    .map((p) => `${p.hostPort}:${p.containerPort}`)
    .join(', ')
}

function formatCreated(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

function handleSearch(): void {
  emit('search', searchQuery.value)
}

function setFilter(filter: 'all' | 'running' | 'stopped'): void {
  activeFilter.value = filter
  emit('filter-change', filter)
}

function handleSelect(containerId: string): void {
  emit('select', containerId)
}

function handleRefresh(): void {
  emit('refresh')
}

function handleStart(containerId: string): void {
  emit('start', containerId)
}

function handleStop(containerId: string): void {
  emit('stop', containerId)
}

function handleRestart(containerId: string): void {
  emit('restart', containerId)
}

function handleRemove(containerId: string): void {
  emit('remove', containerId)
}

function handleSelectAsSandbox(containerId: string): void {
  emit('select-as-sandbox', containerId)
}

function handleOpenTerminal(containerId: string): void {
  emit('open-terminal', containerId)
}

function handleViewLogs(containerId: string): void {
  emit('view-logs', containerId)
}
</script>

<template>
  <div class="container-browser">
    <!-- 搜索和过滤栏 -->
    <div class="browser-header">
      <div class="search-section">
        <input
          v-model="searchQuery"
          type="text"
          class="input search-input"
          placeholder="搜索容器..."
          @input="handleSearch"
        />
        <button class="btn refresh-btn" title="刷新" @click="handleRefresh">刷新</button>
      </div>

      <div class="filter-section">
        <button
          class="filter-btn"
          :class="{ active: activeFilter === 'all' }"
          @click="setFilter('all')"
        >
          全部 ({{ containers.length }})
        </button>
        <button
          class="filter-btn"
          :class="{ active: activeFilter === 'running' }"
          @click="setFilter('running')"
        >
          运行中 ({{ runningCount }})
        </button>
        <button
          class="filter-btn"
          :class="{ active: activeFilter === 'stopped' }"
          @click="setFilter('stopped')"
        >
          已停止 ({{ stoppedCount }})
        </button>
      </div>
    </div>

    <!-- 容器列表 -->
    <div class="container-list">
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>加载容器中...</p>
      </div>

      <div v-else-if="containers.length === 0" class="empty-state">
        <p class="empty-title">暂无容器</p>
        <p class="empty-desc">Docker 中没有发现容器，请创建一个新容器</p>
      </div>

      <div
        v-for="container in containers"
        :key="container.id"
        class="container-card"
        :class="{
          active: container.id === selectedContainerId,
          running: container.state === 'running'
        }"
        @click="handleSelect(container.id)"
      >
        <!-- 容器头部 -->
        <div class="container-header">
          <div class="container-title">
            <span class="state-indicator" :class="getStateClass(container.state)"></span>
            <span class="container-name">{{
              container.names[0]?.replace(/^\//, '') || '未命名'
            }}</span>
          </div>
          <span class="container-state" :class="getStateClass(container.state)">
            {{ getStateLabel(container.state) }}
          </span>
        </div>

        <!-- 容器信息 -->
        <div class="container-info">
          <div class="info-row">
            <span class="info-label">镜像</span>
            <span class="info-value" :title="container.image">{{ container.image }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">端口</span>
            <span class="info-value">{{ formatPorts(container.ports) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatCreated(container.created) }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="container-actions">
          <button
            class="action-btn primary"
            :disabled="container.state !== 'running'"
            @click.stop="handleSelectAsSandbox(container.id)"
          >
            选择作为沙箱
          </button>
          <button
            class="action-btn"
            :disabled="container.state !== 'running'"
            @click.stop="handleOpenTerminal(container.id)"
          >
            终端
          </button>
          <button class="action-btn" @click.stop="handleViewLogs(container.id)">日志</button>
          <button
            v-if="container.state !== 'running'"
            class="action-btn success"
            @click.stop="handleStart(container.id)"
          >
            启动
          </button>
          <button v-else class="action-btn warning" @click.stop="handleStop(container.id)">
            停止
          </button>
          <button class="action-btn" @click.stop="handleRestart(container.id)">重启</button>
          <button class="action-btn danger" @click.stop="handleRemove(container.id)">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 头部样式 */
.browser-header {
  padding: 16px;
  border-bottom: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
}

.search-section {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.search-input {
  flex: 1;
}

.refresh-btn {
  padding: 8px 12px;
  font-size: 14px;
}

.filter-section {
  display: flex;
  gap: 8px;
}

.filter-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:hover {
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.filter-btn.active {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-bg);
}

/* 列表样式 */
.container-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--theme-text-secondary);
  gap: 16px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--theme-text-secondary);
  text-align: center;
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.empty-desc {
  font-size: 14px;
  margin: 0;
}

/* 容器卡片样式 */
.container-card {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.container-card:hover {
  border-color: var(--theme-text-secondary);
}

.container-card.active {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.container-card.running {
  border-left: 3px solid var(--theme-success);
}

/* 容器头部 */
.container-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.container-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.state-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.container-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--theme-text);
}

.container-state {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 500;
}

/* 状态样式 */
.state-created {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-info);
}

.state-created.state-indicator {
  background-color: var(--theme-info);
}

.state-running {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-success);
}

.state-running.state-indicator {
  background-color: var(--theme-success);
}

.state-paused {
  background-color: rgba(210, 153, 34, 0.2);
  color: var(--theme-warning);
}

.state-paused.state-indicator {
  background-color: var(--theme-warning);
}

.state-restarting {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-info);
}

.state-restarting.state-indicator {
  background-color: var(--theme-info);
}

.state-removing {
  background-color: rgba(139, 148, 158, 0.2);
  color: var(--theme-text-secondary);
}

.state-removing.state-indicator {
  background-color: var(--theme-text-secondary);
}

.state-exited,
.state-dead {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--theme-danger);
}

.state-exited.state-indicator,
.state-dead.state-indicator {
  background-color: var(--theme-danger);
}

/* 容器信息 */
.container-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.info-label {
  color: var(--theme-text-secondary);
  min-width: 60px;
  flex-shrink: 0;
}

.info-value {
  color: var(--theme-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作按钮 */
.container-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.action-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-family: var(--theme-font);
  background-color: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  border-color: var(--theme-text);
  color: var(--theme-text);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-bg);
}

.action-btn.primary:hover:not(:disabled) {
  opacity: 0.9;
}

.action-btn.success {
  background-color: var(--theme-success);
  border-color: var(--theme-success);
  color: var(--theme-bg);
}

.action-btn.warning {
  background-color: var(--theme-warning);
  border-color: var(--theme-warning);
  color: var(--theme-bg);
}

.action-btn.danger {
  background-color: var(--theme-danger);
  border-color: var(--theme-danger);
  color: white;
}

.action-btn.danger:hover {
  opacity: 0.9;
}
</style>
