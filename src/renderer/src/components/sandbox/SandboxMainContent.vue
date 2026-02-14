<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { SandboxData, SandboxLogEntry, SandboxStatus } from '@shared/types/sandbox'

const props = defineProps<{
  sidebarCollapsed: boolean
  currentSandbox: SandboxData | null
  operationLogs: SandboxLogEntry[]
}>()

const emit = defineEmits<{
  (e: 'toggle-sidebar'): void
  (e: 'rename', sandboxId: string, newName: string): void
}>()

const hasSandbox = computed(() => !!props.currentSandbox)

const isEditing = ref(false)
const editingName = ref('')
const nameInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.currentSandbox?.name,
  () => {
    if (props.currentSandbox && !isEditing.value) {
      editingName.value = props.currentSandbox.name
    }
  },
  { immediate: true }
)

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

function startEditing(): void {
  if (!props.currentSandbox) return
  editingName.value = props.currentSandbox.name
  isEditing.value = true
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}

function saveName(): void {
  if (!props.currentSandbox) return
  const trimmedName = editingName.value.trim()
  if (trimmedName && trimmedName !== props.currentSandbox.name) {
    emit('rename', props.currentSandbox.sandboxId, trimmedName)
  }
  isEditing.value = false
}

function cancelEditing(): void {
  if (props.currentSandbox) {
    editingName.value = props.currentSandbox.name
  }
  isEditing.value = false
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    cancelEditing()
  } else if (event.key === 'Enter') {
    saveName()
  }
}

function handleBlur(): void {
  saveName()
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
      <template v-if="currentSandbox">
        <span class="header-title">{{ currentSandbox.name }}</span>
      </template>
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
              <div v-if="isEditing" class="info-value-edit">
                <input
                  ref="nameInputRef"
                  v-model="editingName"
                  class="name-input"
                  @keydown="handleKeydown"
                  @blur="handleBlur"
                />
              </div>
              <div v-else class="info-value-wrapper">
                <span class="info-value">{{ currentSandbox?.name }}</span>
                <button class="btn-edit-inline" title="编辑" @click="startEditing">
                  <svg viewBox="0 0 1024 1024" width="14" height="14">
                    <path
                      d="M864.909927 823.227521a31.261805 31.261805 0 0 1 4.251605 62.231832l-4.251605 0.291777h-333.459249a31.261805 31.261805 0 0 1-4.251605-62.231832l4.251605-0.291777h333.459249z"
                      fill="currentColor"
                    />
                    <path
                      d="M835.469757 155.90459a166.729624 166.729624 0 0 1 0 235.791296l-450.92138 450.92138a83.364812 83.364812 0 0 1-49.751963 23.932817l-184.35932 20.484368a41.682406 41.682406 0 0 1-46.067724-46.067724l20.513842-184.388794a83.364812 83.364812 0 0 1 23.903343-49.781437L599.648987 155.934064a166.729624 166.729624 0 0 1 235.791296 0z m-44.210868 44.210868a104.206015 104.206015 0 0 0-142.358995-4.656878l-5.010565 4.656878-450.92138 450.92138a20.841203 20.841203 0 0 0-5.27583 8.989543l-0.6779 3.448448-17.625399 158.510699 158.510698-17.6254a20.841203 20.841203 0 0 0 9.755865-3.684239l2.682126-2.269491L791.258889 347.485018a104.206015 104.206015 0 0 0 0-147.36956z"
                      fill="currentColor"
                    />
                    <path
                      d="M547.638023 279.397574a31.261805 31.261805 0 0 1 40.998211-47.010889l3.212657 2.800021 176.843472 176.843472a31.261805 31.261805 0 0 1-41.027686 46.981416l-3.183182-2.770548-176.843472-176.843472z"
                      fill="currentColor"
                    />
                    <path
                      d="M864.909927 698.180302a31.261805 31.261805 0 0 1 4.251605 62.231833l-4.251605 0.291777h-166.729625a31.261805 31.261805 0 0 1-4.251605-62.231833l4.251605-0.291777h166.729625z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </div>
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

.header-title {
  margin-left: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  line-height: 1;
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
  font-size: 16px;
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
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-size: 14px;
  color: var(--theme-text-secondary);
}

.info-value {
  font-size: 15px;
  color: var(--theme-text);
  line-height: 22px;
}

.info-value-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-value-edit {
  display: flex;
  align-items: center;
}

.name-input {
  padding: 4px 8px;
  font-size: 15px;
  font-family: var(--theme-font);
  color: var(--theme-text);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-accent);
  border-radius: 4px;
  outline: none;
  width: 100%;
  max-width: 250px;
}

.btn-edit-inline {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background-color: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-edit-inline:hover {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
  color: var(--theme-accent);
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
