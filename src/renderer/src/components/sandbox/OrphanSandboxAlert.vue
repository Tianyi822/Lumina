<script setup lang="ts">
import { computed, ref, watch } from 'vue'

// 沙箱项接口
interface SandboxItem {
  sandboxId: string
  name: string
  creationType?: string
  composeProjectName?: string
  frontend?: {
    volumeName?: string
  }
}

const props = defineProps<{
  visible: boolean
  sandbox?: SandboxItem | null
  isReloading?: boolean
  canRecover?: boolean
  recoverLabel?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'recover', sandboxId: string): void
  (e: 'cleanup', sandboxId: string): void
}>()

const isRecovering = ref(false)
const recoveringLabel = computed(() =>
  props.recoverLabel?.includes('重建') ? '重建中...' : '重新关联中...'
)

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      isRecovering.value = false
    }
  }
)

watch(
  () => props.isReloading,
  (isReloading) => {
    if (!isReloading) {
      isRecovering.value = false
    }
  }
)

function handleClose(): void {
  emit('close')
}

function handleRecover(): void {
  if (!props.sandbox) return
  isRecovering.value = true
  emit('recover', props.sandbox.sandboxId)
}

function handleCleanup(): void {
  if (!props.sandbox) return
  emit('cleanup', props.sandbox.sandboxId)
}
</script>

<template>
  <Transition name="alert">
    <div v-if="visible" class="orphan-alert">
      <div class="alert-content">
        <div class="alert-icon">⚠️</div>
        <div class="alert-message">
          <h4>容器已丢失</h4>
          <p>
            沙箱「{{ sandbox?.name }}」关联的容器已丢失。这可能是因为容器被手动删除或 Docker
            服务重启导致的。
          </p>
          <p v-if="sandbox?.composeProjectName" class="project-info">
            Compose 项目：{{ sandbox.composeProjectName }}
          </p>
          <p v-if="sandbox?.frontend?.volumeName" class="project-info">
            工作区 Volume：{{ sandbox.frontend.volumeName }}
          </p>
        </div>
        <div class="alert-actions">
          <button
            v-if="canRecover"
            class="btn-recover"
            :disabled="isReloading || isRecovering"
            @click="handleRecover"
          >
            <span v-if="isRecovering">{{ recoveringLabel }}</span>
            <span v-else>{{ recoverLabel || '重新关联容器' }}</span>
          </button>
          <button class="btn-cleanup" :disabled="isReloading" @click="handleCleanup">
            清理沙箱
          </button>
          <button class="btn-dismiss" :disabled="isReloading" @click="handleClose">暂时忽略</button>
        </div>
      </div>
      <button class="alert-close" @click="handleClose">×</button>
    </div>
  </Transition>
</template>

<style scoped>
.orphan-alert {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  background: linear-gradient(135deg, rgba(248, 81, 73, 0.95) 0%, rgba(213, 69, 62, 0.95) 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 4px 16px rgba(248, 81, 73, 0.3);
  z-index: 100;
  color: white;
}

.alert-enter-active,
.alert-leave-active {
  transition: all 0.3s ease;
}

.alert-enter-from,
.alert-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.alert-content {
  display: flex;
  gap: 16px;
}

.alert-icon {
  font-size: 32px;
  flex-shrink: 0;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

.alert-message {
  flex: 1;
}

.alert-message h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
}

.alert-message p {
  margin: 0 0 4px 0;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.95;
}

.project-info {
  font-size: 12px !important;
  opacity: 0.85 !important;
  font-family: var(--theme-font);
  background-color: rgba(0, 0, 0, 0.15);
  padding: 4px 8px;
  border-radius: 4px;
  display: inline-block;
  margin-top: 8px !important;
}

.alert-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 140px;
}

.alert-actions button {
  padding: 8px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-recover {
  background-color: white;
  border: 1px solid white;
  color: var(--theme-danger);
  font-weight: 500;
}

.btn-recover:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.9);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.btn-recover:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cleanup {
  background-color: transparent;
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: white;
}

.btn-cleanup:hover:not(:disabled) {
  border-color: white;
  background-color: rgba(0, 0, 0, 0.1);
}

.btn-cleanup:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-dismiss {
  background-color: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  padding: 4px 8px;
}

.btn-dismiss:hover:not(:disabled) {
  color: white;
  text-decoration: underline;
}

.btn-dismiss:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.alert-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.15);
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.alert-close:hover {
  background: rgba(0, 0, 0, 0.25);
}
</style>
