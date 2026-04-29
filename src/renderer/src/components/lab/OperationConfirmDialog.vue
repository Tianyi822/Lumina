<script setup lang="ts">
import { ref, computed, watch } from 'vue'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface OperationConfirmRequest {
  id: string
  operation: string
  title: string
  message: string
  details: Record<string, unknown>
  riskLevel: RiskLevel
  labName?: string
  labType?: string
}

const props = defineProps<{
  visible: boolean
  request?: OperationConfirmRequest | null
}>()

const emit = defineEmits<{
  (e: 'confirm', requestId: string): void
  (e: 'cancel', requestId: string): void
}>()

const dontAskAgain = ref(false)

// 重置状态当对话框显示时
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      dontAskAgain.value = false
    }
  }
)

const riskConfig = computed(() => {
  const configs: Record<RiskLevel, { color: string; icon: string; title: string }> = {
    low: {
      color: 'var(--sm-color-status-info)',
      icon: 'ℹ️',
      title: '确认操作'
    },
    medium: {
      color: 'var(--sm-color-status-warning)',
      icon: '⚠️',
      title: '确认操作'
    },
    high: {
      color: 'var(--sm-color-status-danger)',
      icon: '🚨',
      title: '高风险操作'
    },
    critical: {
      color: '#dc2626',
      icon: '⛔',
      title: '危险操作'
    }
  }
  return configs[props.request?.riskLevel || 'low']
})

const formattedDetails = computed(() => {
  if (!props.request?.details) return []
  return Object.entries(props.request.details).map(([key, value]) => ({
    key: formatKey(key),
    value: formatValue(value)
  }))
})

function formatKey(key: string): string {
  const keyMap: Record<string, string> = {
    lab_id: '实验室 ID',
    lab_name: '实验室名称',
    container_id: '容器 ID',
    container_name: '容器名称',
    command: '命令',
    timeout: '超时时间',
    delete_containers: '删除容器',
    force: '强制操作'
  }
  return keyMap[key] || key
}

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }
  if (value === null || value === undefined) {
    return '-'
  }
  return String(value)
}

function handleConfirm(): void {
  if (props.request) {
    emit('confirm', props.request.id)
  }
}

function handleCancel(): void {
  if (props.request) {
    emit('cancel', props.request.id)
  }
}

function handleBackdropClick(): void {
  handleCancel()
}
</script>

<template>
  <div v-if="visible" class="confirm-dialog-overlay" @click.self="handleBackdropClick">
    <div class="confirm-dialog" :class="`risk-${request?.riskLevel || 'low'}`">
      <div class="dialog-header">
        <span class="risk-icon" :style="{ color: riskConfig.color }">{{ riskConfig.icon }}</span>
        <h3>{{ request?.title || riskConfig.title }}</h3>
      </div>

      <div class="dialog-body">
        <p class="confirm-message">{{ request?.message }}</p>

        <div v-if="formattedDetails.length > 0" class="details-section">
          <h4>操作详情</h4>
          <div class="details-list">
            <div v-for="(detail, index) in formattedDetails" :key="index" class="detail-item">
              <span class="detail-key">{{ detail.key }}:</span>
              <span class="detail-value">{{ detail.value }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="request?.riskLevel === 'high' || request?.riskLevel === 'critical'"
          class="warning-box"
        >
          <strong>⚠️ 警告</strong>
          <p>此操作不可恢复，请谨慎确认。</p>
        </div>

        <label class="dont-ask-again">
          <input v-model="dontAskAgain" type="checkbox" />
          <span>不再询问（仅本次会话有效）</span>
        </label>
      </div>

      <div class="dialog-footer">
        <button class="btn-cancel" @click="handleCancel">取消</button>
        <button
          class="btn-confirm"
          :class="`btn-risk-${request?.riskLevel || 'low'}`"
          @click="handleConfirm"
        >
          确认{{ request?.riskLevel === 'critical' ? '（危险）' : '' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.confirm-dialog {
  background-color: var(--sm-color-bg-app);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  width: 480px;
  max-width: 90vw;
  overflow: hidden;
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* 风险等级边框 */
.risk-low {
  border-top: 4px solid var(--sm-color-status-info);
}

.risk-medium {
  border-top: 4px solid var(--sm-color-status-warning);
}

.risk-high {
  border-top: 4px solid var(--sm-color-status-danger);
}

.risk-critical {
  border-top: 4px solid #dc2626;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sm-color-border-default);
}

.risk-icon {
  font-size: 24px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.dialog-body {
  padding: 20px;
}

.confirm-message {
  margin: 0 0 16px 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--sm-color-text-primary);
}

.details-section {
  margin-bottom: 16px;
}

.details-section h4 {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  margin: 0 0 8px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.details-list {
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 6px;
  padding: 12px;
}

.detail-item {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.detail-item:last-child {
  margin-bottom: 0;
}

.detail-key {
  color: var(--sm-color-text-secondary);
  min-width: 100px;
}

.detail-value {
  color: var(--sm-color-text-primary);
  font-family: monospace;
}

.warning-box {
  background-color: rgba(248, 81, 73, 0.1);
  border: 1px solid var(--sm-color-status-danger);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.warning-box strong {
  color: var(--sm-color-status-danger);
  display: block;
  margin-bottom: 4px;
}

.warning-box p {
  margin: 0;
  font-size: 13px;
  color: var(--sm-color-text-primary);
}

.dont-ask-again {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
}

.dont-ask-again input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--sm-color-border-default);
  background-color: var(--sm-color-surface-1);
}

.btn-cancel,
.btn-confirm {
  padding: 8px 16px;
  font-size: 14px;
  font-family: var(--sm-font-sans);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel {
  background-color: var(--sm-color-bg-app);
  border: 1px solid var(--sm-color-border-default);
  color: var(--sm-color-text-primary);
}

.btn-cancel:hover {
  border-color: var(--sm-color-text-secondary);
}

.btn-confirm {
  border: 1px solid transparent;
  color: white;
}

/* 风险等级按钮样式 */
.btn-risk-low {
  background-color: var(--sm-color-status-info);
}

.btn-risk-medium {
  background-color: var(--sm-color-status-warning);
  color: var(--sm-color-bg-app);
}

.btn-risk-high {
  background-color: var(--sm-color-status-danger);
}

.btn-risk-critical {
  background-color: #dc2626;
}

.btn-confirm:hover {
  opacity: 0.9;
}
</style>
