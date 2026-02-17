<script setup lang="ts">
import { ref, computed, watch } from 'vue'

// 创建类型
type SandboxCreationType = 'existing' | 'compose' | 'dockerfile'

// 沙箱项接口
interface SandboxItem {
  sandboxId: string
  name: string
  creationType?: SandboxCreationType
  containerIds?: string[]
  composeProjectName?: string
}

const props = defineProps<{
  visible: boolean
  sandbox?: SandboxItem | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', sandboxId: string, deleteContainers: boolean): void
}>()

const deleteContainers = ref(false)

// 根据沙箱类型显示不同的确认内容
const confirmTitle = computed(() => {
  if (!props.sandbox) return '确认删除'
  const type = props.sandbox.creationType
  switch (type) {
    case 'existing':
      return '确认删除沙箱'
    case 'compose':
      return '确认删除 Compose 沙箱'
    case 'dockerfile':
      return '确认删除 Dockerfile 沙箱'
    default:
      return '确认删除沙箱'
  }
})

const confirmMessage = computed(() => {
  if (!props.sandbox) return ''
  const type = props.sandbox.creationType
  const name = props.sandbox.name
  const containerCount = props.sandbox.containerIds?.length || 0

  switch (type) {
    case 'existing':
      return `确定要删除沙箱「${name}」吗？\n删除沙箱不会删除容器，容器将继续运行。`
    case 'compose':
      if (containerCount > 1) {
        return `确定要删除 Compose 沙箱「${name}」吗？\n该沙箱包含 ${containerCount} 个容器。`
      }
      return `确定要删除 Compose 沙箱「${name}」吗？`
    case 'dockerfile':
      return `确定要删除 Dockerfile 沙箱「${name}」吗？`
    default:
      return `确定要删除沙箱「${name}」吗？`
  }
})

// 是否显示"同时删除容器"选项
const showDeleteContainerOption = computed(() => {
  const type = props.sandbox?.creationType
  return type === 'compose' || type === 'dockerfile'
})

// 删除选项的标签文本
const deleteContainerLabel = computed(() => {
  const type = props.sandbox?.creationType
  const containerCount = props.sandbox?.containerIds?.length || 0
  if (type === 'compose' && containerCount > 1) {
    return `同时删除 ${containerCount} 个容器`
  }
  return '同时删除容器'
})

// 警告提示文本
const warningMessage = computed(() => {
  if (!props.sandbox) return ''
  const type = props.sandbox?.creationType
  if (type === 'compose' && props.sandbox.composeProjectName) {
    return `将执行 docker-compose down 删除项目「${props.sandbox.composeProjectName}」的所有容器`
  }
  return '删除容器后将无法恢复'
})

// 重置状态
function resetState(): void {
  deleteContainers.value = false
}

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
  resetState()
  emit('close')
}

function handleConfirm(): void {
  if (!props.sandbox) return
  emit('confirm', props.sandbox.sandboxId, deleteContainers.value)
  resetState()
}
</script>

<template>
  <div v-if="visible" class="delete-confirm-overlay" @click.self="handleClose">
    <div class="delete-confirm-dialog">
      <div class="dialog-header">
        <h3>{{ confirmTitle }}</h3>
        <button class="close-btn" @click="handleClose">×</button>
      </div>

      <div class="dialog-body">
        <p class="confirm-message">{{ confirmMessage }}</p>

        <!-- 同时删除容器选项 -->
        <label v-if="showDeleteContainerOption" class="delete-option">
          <input v-model="deleteContainers" type="checkbox" />
          <span>{{ deleteContainerLabel }}</span>
        </label>

        <!-- 警告提示 -->
        <p v-if="deleteContainers || sandbox?.creationType === 'existing'" class="warning-message">
          {{ warningMessage }}
        </p>
      </div>

      <div class="dialog-footer">
        <button class="btn-cancel" @click="handleClose">取消</button>
        <button class="btn-confirm" @click="handleConfirm">确认删除</button>
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
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
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
  border-bottom: 1px solid var(--theme-border);
}

.dialog-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
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
  color: var(--theme-text-secondary);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
}

.dialog-body {
  padding: 20px;
}

.confirm-message {
  margin: 0 0 16px 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--theme-text);
  white-space: pre-line;
}

.delete-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.delete-option:hover {
  border-color: var(--theme-text-secondary);
}

.delete-option input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.delete-option span {
  font-size: 14px;
  color: var(--theme-text);
}

.warning-message {
  margin: 12px 0 0 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--theme-warning);
  background-color: rgba(210, 153, 34, 0.1);
  border: 1px solid rgba(210, 153, 34, 0.3);
  border-radius: 6px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.btn-cancel,
.btn-confirm {
  padding: 8px 16px;
  font-size: 14px;
  font-family: var(--theme-font);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-cancel {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  color: var(--theme-text-secondary);
}

.btn-cancel:hover {
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.btn-confirm {
  background-color: var(--theme-danger);
  border: 1px solid var(--theme-danger);
  color: white;
}

.btn-confirm:hover {
  opacity: 0.9;
}
</style>
