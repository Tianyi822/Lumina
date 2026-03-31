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
        <div class="alert-message">
          <span class="alert-eyebrow">运行异常</span>
          <h4>容器已丢失</h4>
          <p>
            沙箱「{{ sandbox?.name }}」关联的容器不再可用。这通常意味着容器被手动删除，或 Docker
            服务在重启后未恢复到原状态。
          </p>

          <div class="alert-meta">
            <span v-if="sandbox?.composeProjectName" class="alert-meta-item">
              Compose 项目 {{ sandbox.composeProjectName }}
            </span>
            <span v-if="sandbox?.frontend?.volumeName" class="alert-meta-item">
              工作区 Volume {{ sandbox.frontend.volumeName }}
            </span>
          </div>
        </div>

        <div class="alert-actions">
          <button
            v-if="canRecover"
            class="btn-primary"
            :disabled="isReloading || isRecovering"
            @click="handleRecover"
          >
            <span v-if="isRecovering">{{ recoveringLabel }}</span>
            <span v-else>{{ recoverLabel || '重新关联容器' }}</span>
          </button>
          <button class="btn-danger" :disabled="isReloading" @click="handleCleanup">清理沙箱</button>
          <button class="btn-secondary" :disabled="isReloading" @click="handleClose">
            暂时忽略
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.orphan-alert {
  border: 1px solid rgba(199, 120, 120, 0.28);
  border-radius: var(--sm-radius-md);
  background: rgba(199, 120, 120, 0.08);
}

.alert-enter-active,
.alert-leave-active {
  transition:
    opacity var(--sm-transition-fast),
    transform var(--sm-transition-fast);
}

.alert-enter-from,
.alert-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.alert-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: var(--sm-space-4);
}

.alert-message {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
}

.alert-eyebrow {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-status-danger);
}

.alert-message h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.alert-message p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.alert-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
}

.alert-meta-item {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(199, 120, 120, 0.24);
  border-radius: 999px;
  background: rgba(11, 11, 12, 0.36);
  color: var(--sm-color-text-primary);
  font-family: var(--sm-font-mono);
  font-size: 11px;
}

.alert-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--sm-space-2);
}

@media (max-width: 768px) {
  .alert-content {
    flex-direction: column;
  }

  .alert-actions {
    width: 100%;
  }

  .alert-actions > button {
    flex: 1;
  }
}
</style>
