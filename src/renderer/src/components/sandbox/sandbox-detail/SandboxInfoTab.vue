<script setup lang="ts">
/**
 * 沙箱基本信息 Tab 组件
 * 显示沙箱的基本信息和操作日志
 */
import { ref, computed } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { useSandboxRename } from './composables/useSandboxRename'
import type { SandboxData, SandboxLogEntry, SandboxStatus } from '@shared/types/sandbox'

const props = defineProps<{
  currentSandbox: SandboxData | null
  operationLogs: SandboxLogEntry[]
}>()

const emit = defineEmits<{
  (e: 'rename', sandboxId: string, newName: string): void
  (e: 'refresh-status'): void
}>()

// 模板引用
const nameInputRef = ref<HTMLInputElement | null>(null)

// 重命名逻辑
const { isEditing, editingName, startEditing, handleKeydown, handleBlur } = useSandboxRename(
  computed(() => props.currentSandbox),
  emit,
  nameInputRef
)

// 创建类型标签
const creationTypeLabel = computed(() => {
  if (!props.currentSandbox?.creationType) return '未知'
  const labels: Record<string, string> = {
    existing: '已有容器',
    compose: 'Compose',
    dockerfile: 'Dockerfile'
  }
  return labels[props.currentSandbox.creationType] || props.currentSandbox.creationType
})

// 状态相关方法
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
</script>

<template>
  <div class="sandbox-info-tab">
    <div class="sandbox-detail">
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
                <SvgIcon name="edit" :size="14" />
              </button>
            </div>
          </div>
          <div class="info-item">
            <span class="info-label">状态</span>
            <div class="info-value-wrapper">
              <span
                class="info-value status-badge"
                :class="getStatusClass(currentSandbox?.status || 'stopped')"
              >
                {{ getStatusLabel(currentSandbox?.status || 'stopped') }}
              </span>
              <button
                class="btn-refresh-status"
                title="刷新状态"
                @click.stop="$emit('refresh-status')"
              >
                <SvgIcon name="refresh" :size="14" />
              </button>
            </div>
          </div>
          <div class="info-item">
            <span class="info-label">创建类型</span>
            <span class="info-value">{{ creationTypeLabel }}</span>
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
</template>

<style scoped>
.sandbox-info-tab {
  height: 100%;
  overflow: hidden;
}

.sandbox-detail {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  height: 100%;
  overflow-y: auto;
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

.btn-refresh-status {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--theme-accent);
  transition:
    opacity 0.2s,
    background-color 0.2s,
    color 0.2s;
}

.btn-refresh-status svg {
  display: block;
}

.btn-refresh-status:hover {
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
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
