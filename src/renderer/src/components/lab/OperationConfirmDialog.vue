<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import styles from './OperationConfirmDialog.module.css'

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
  <div v-if="visible" :class="styles['confirm-dialog-overlay']" @click.self="handleBackdropClick">
    <div :class="[styles['confirm-dialog'], styles[`risk-${request?.riskLevel || 'low'}`]]">
      <div :class="styles['dialog-header']">
        <span :class="styles['risk-icon']" :style="{ color: riskConfig.color }">{{
          riskConfig.icon
        }}</span>
        <h3>{{ request?.title || riskConfig.title }}</h3>
      </div>

      <div :class="styles['dialog-body']">
        <p :class="styles['confirm-message']">{{ request?.message }}</p>

        <div v-if="formattedDetails.length > 0" :class="styles['details-section']">
          <h4>操作详情</h4>
          <div :class="styles['details-list']">
            <div
              v-for="(detail, index) in formattedDetails"
              :key="index"
              :class="styles['detail-item']"
            >
              <span :class="styles['detail-key']">{{ detail.key }}:</span>
              <span :class="styles['detail-value']">{{ detail.value }}</span>
            </div>
          </div>
        </div>

        <div
          v-if="request?.riskLevel === 'high' || request?.riskLevel === 'critical'"
          :class="styles['warning-box']"
        >
          <strong>⚠️ 警告</strong>
          <p>此操作不可恢复，请谨慎确认。</p>
        </div>

        <label :class="styles['dont-ask-again']">
          <input v-model="dontAskAgain" type="checkbox" />
          <span>不再询问（仅本次会话有效）</span>
        </label>
      </div>

      <div :class="styles['dialog-footer']">
        <button :class="styles['btn-cancel']" @click="handleCancel">取消</button>
        <button
          :class="[styles['btn-confirm'], styles[`btn-risk-${request?.riskLevel || 'low'}`]]"
          @click="handleConfirm"
        >
          确认{{ request?.riskLevel === 'critical' ? '（危险）' : '' }}
        </button>
      </div>
    </div>
  </div>
</template>
