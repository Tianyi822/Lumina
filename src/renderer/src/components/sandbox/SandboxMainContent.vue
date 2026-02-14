<script setup lang="ts">
import { computed } from 'vue'
import type { SandboxData, SandboxLogEntry, SandboxStatus } from '@shared/types/sandbox'

const props = defineProps<{
  sidebarCollapsed: boolean
  currentSandbox: SandboxData | null
  operationLogs: SandboxLogEntry[]
}>()

const emit = defineEmits<{
  (e: 'toggle-sidebar'): void
}>()

const hasSandbox = computed(() => !!props.currentSandbox)

function getStatusLabel(status: SandboxStatus): string {
  const labels: Record<SandboxStatus, string> = {
    creating: '创建中',
    running: '运行中',
    stopped: '已停止',
    error: '错误'
  }
  return labels[status] || status
}

function getStatusClass(status: SandboxStatus): string {
  return `status-${status}`
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatLogTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function getLogLevelClass(level: string): string {
  return `log-level-${level}`
}

function handleToggleSidebar(): void {
  emit('toggle-sidebar')
}
</script>

<template>
  <main class="sandbox-main-content">
    <div class="content-header">
      <button
        class="btn toggle-sidebar-btn"
        :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="handleToggleSidebar"
      >
        <span class="toggle-icon">{{ sidebarCollapsed ? '»' : '«' }}</span>
      </button>
      <div class="header-spacer"></div>
    </div>

    <div class="content-body">
      <div v-if="!hasSandbox" class="empty-state">
        <p class="empty-text">选择或创建一个沙箱开始</p>
      </div>

      <div v-else class="sandbox-detail">
        <div class="info-section">
          <h3 class="section-title">基本信息</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">名称</span>
              <span class="info-value">{{ currentSandbox?.name }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">状态</span>
              <span
                class="info-value status-badge"
                :class="getStatusClass(currentSandbox?.status || 'stopped')"
              >
                {{ getStatusLabel(currentSandbox?.status || 'stopped') }}
              </span>
            </div>
            <div class="info-item">
              <span class="info-label">创建时间</span>
              <span class="info-value">{{ formatDateTime(currentSandbox?.createdAt || '') }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">更新时间</span>
              <span class="info-value">{{ formatDateTime(currentSandbox?.updatedAt || '') }}</span>
            </div>
            <div v-if="currentSandbox?.description" class="info-item full-width">
              <span class="info-label">描述</span>
              <span class="info-value">{{ currentSandbox.description }}</span>
            </div>
          </div>
        </div>

        <div class="log-section">
          <h3 class="section-title">操作日志</h3>
          <div class="log-container">
            <div v-if="operationLogs.length === 0" class="empty-log">暂无操作日志</div>
            <div v-else class="log-list">
              <div
                v-for="(log, index) in operationLogs"
                :key="index"
                class="log-entry"
                :class="getLogLevelClass(log.level)"
              >
                <span class="log-time">[{{ formatLogTime(log.timestamp) }}]</span>
                <span class="log-message">{{ log.message }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.sandbox-main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--theme-bg);
  overflow: hidden;
}

.content-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.toggle-sidebar-btn {
  padding: 6px 10px;
  font-size: 16px;
}

.toggle-icon {
  font-weight: bold;
}

.header-spacer {
  flex: 1;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
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

.sandbox-detail {
  max-width: 800px;
  margin: 0 auto;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.info-section {
  margin-bottom: 32px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.info-value {
  font-size: 14px;
  color: var(--theme-text);
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-creating {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-info);
}

.status-running {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-success);
}

.status-stopped {
  background-color: rgba(139, 148, 158, 0.2);
  color: var(--theme-text-secondary);
}

.status-error {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--theme-danger);
}

.log-section {
  margin-bottom: 24px;
}

.log-container {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 12px;
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.empty-log {
  color: var(--theme-text-secondary);
  font-size: 13px;
  text-align: center;
  padding: 24px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-entry {
  font-size: 13px;
  font-family: var(--theme-font);
  line-height: 1.5;
}

.log-time {
  color: var(--theme-text-secondary);
  margin-right: 8px;
}

.log-message {
  color: var(--theme-text);
}

.log-level-info .log-message {
  color: var(--theme-text);
}

.log-level-warn .log-message {
  color: var(--theme-warning);
}

.log-level-error .log-message {
  color: var(--theme-danger);
}
</style>
