<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { DeleteSandboxOptions, SandboxCreationType } from '@shared/types/sandbox'
import { getDeleteDialogConfig } from '@renderer/utils/sandboxPermissions'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

// 沙箱项接口
interface SandboxItem {
  sandboxId: string
  name: string
  creationType?: SandboxCreationType
  containerIds?: string[]
  composeProjectName?: string
  hasWorkspace?: boolean
  workspaceName?: string
}

const props = defineProps<{
  visible: boolean
  sandbox?: SandboxItem | null
  isDeleting?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', sandboxId: string, options: DeleteSandboxOptions): void
}>()

const deleteContainers = ref(false)

// 使用工具函数获取对话框配置
const dialogConfig = computed(() => {
  if (!props.sandbox) return null
  return getDeleteDialogConfig(
    props.sandbox.creationType || 'existing',
    props.sandbox.containerIds?.length || 0,
    props.sandbox.name
  )
})

// 根据沙箱类型显示不同的确认内容
const confirmTitle = computed(() => dialogConfig.value?.title || '确认删除')
const confirmMessage = computed(() => dialogConfig.value?.message || '')
const showDeleteContainerOption = computed(() => dialogConfig.value?.showDeleteOption ?? false)
const deleteContainerLabel = computed(() => dialogConfig.value?.deleteOptionLabel || '')
const warningMessage = computed(() => dialogConfig.value?.warningMessage || '')
const typeTheme = computed(() => dialogConfig.value?.typeTheme || 'default')

// 是否为 existing 类型
const isExistingType = computed(() => props.sandbox?.creationType === 'existing')

// 重置状态
function resetState(): void {
  deleteContainers.value = dialogConfig.value?.defaultDeleteContainers ?? false
}

// 监听对话框显示，初始化状态
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetState()
    }
  },
  { immediate: true }
)

// 监听 visible 变化
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      resetState()
    }
  }
)

function handleClose(): void {
  if (props.isDeleting) return // 删除中不允许关闭
  resetState()
  emit('close')
}

function handleConfirm(): void {
  if (!props.sandbox || props.isDeleting) return
  // 简化删除逻辑：默认同时删除容器和工作区
  emit('confirm', props.sandbox.sandboxId, {
    deleteContainers: deleteContainers.value,
    deleteWorkspace: deleteContainers.value // 工作区跟随容器一起删除
  })
}
</script>

<template>
  <div v-if="visible" class="delete-confirm-overlay" @click.self="handleClose">
    <div
      class="delete-confirm-dialog"
      :class="[`theme-${typeTheme}`, { 'existing-type': isExistingType }]"
    >
      <div class="dialog-header">
        <h3>{{ confirmTitle }}</h3>
        <button class="close-btn" :disabled="isDeleting" @click="handleClose">×</button>
      </div>

      <div class="dialog-body">
        <!-- existing 类型提示图标 -->
        <div v-if="isExistingType" class="type-notice">
          <SvgIcon name="warning" :size="24" />
          <span>只读沙箱 · 仅删除记录</span>
        </div>

        <p class="confirm-message">{{ confirmMessage }}</p>

        <!-- 同时删除容器选项 -->
        <label v-if="showDeleteContainerOption" class="delete-option">
          <input v-model="deleteContainers" type="checkbox" :disabled="isDeleting" />
          <span>{{ deleteContainerLabel }}</span>
        </label>

        <!-- 警告提示 -->
        <p
          v-if="warningMessage"
          class="warning-message"
          :class="{ 'info-message': isExistingType }"
        >
          {{ warningMessage }}
        </p>
      </div>

      <div class="dialog-footer">
        <button class="btn-cancel" :disabled="isDeleting" @click="handleClose">取消</button>
        <button
          class="btn-confirm"
          :class="{ 'btn-safe': isExistingType, 'btn-loading': isDeleting }"
          :disabled="isDeleting"
          @click="handleConfirm"
        >
          <SvgIcon v-if="isDeleting" name="loading" :size="16" :spin="true" />
          <span>{{ isDeleting ? '删除中...' : '确认删除' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.delete-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
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

.delete-confirm-dialog {
  background-color: var(--sm-color-bg-app);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  width: 400px;
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

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sm-color-border-default);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background-color: var(--sm-color-surface-1);
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
  white-space: pre-line;
}

.delete-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.delete-option:hover {
  border-color: var(--sm-color-text-secondary);
}

.delete-option input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.delete-option span {
  font-size: 14px;
  color: var(--sm-color-text-primary);
}

.workspace-option input[type='checkbox']:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.workspace-option.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.hint-message {
  margin: 10px 0 0 0;
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.warning-message {
  margin: 12px 0 0 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-status-warning);
  background-color: rgba(210, 153, 34, 0.1);
  border: 1px solid rgba(210, 153, 34, 0.3);
  border-radius: 6px;
}

.info-message {
  color: var(--sm-color-status-info);
  background-color: rgba(88, 166, 255, 0.1);
  border-color: rgba(88, 166, 255, 0.3);
}

/* 类型提示 */
.type-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 16px;
  background-color: rgba(210, 153, 34, 0.1);
  border: 1px solid rgba(210, 153, 34, 0.3);
  border-radius: 6px;
  color: var(--sm-color-status-warning);
  font-size: 14px;
  font-weight: 500;
}

.type-notice svg {
  flex-shrink: 0;
}

/* existing 类型特殊样式 */
.existing-type .dialog-header h3 {
  color: var(--sm-color-status-warning);
}

/* 安全按钮样式（用于 existing 类型） */
.btn-safe {
  background-color: var(--sm-color-status-info) !important;
  border-color: var(--sm-color-status-info) !important;
}

.btn-safe:hover {
  opacity: 0.9;
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
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  color: var(--sm-color-text-secondary);
}

.btn-cancel:hover {
  border-color: var(--sm-color-text-secondary);
  color: var(--sm-color-text-primary);
}

.btn-confirm {
  background-color: var(--sm-color-status-danger);
  border: 1px solid var(--sm-color-status-danger);
  color: white;
}

.btn-confirm:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-confirm:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.btn-cancel:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.close-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.btn-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
</style>
