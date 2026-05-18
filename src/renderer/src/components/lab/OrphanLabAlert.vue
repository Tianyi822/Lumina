<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import styles from './OrphanLabAlert.module.css'

// 实验室项接口
interface LabItem {
  labId: string
  name: string
  creationType?: string
  composeProjectName?: string
  frontend?: {
    volumeName?: string
  }
}

const props = defineProps<{
  visible: boolean
  lab?: LabItem | null
  isReloading?: boolean
  canRecover?: boolean
  recoverLabel?: string
}>()

const emit = defineEmits<{
  (e: 'recover', labId: string): void
  (e: 'cleanup', labId: string): void
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

function handleRecover(): void {
  if (!props.lab) return
  isRecovering.value = true
  emit('recover', props.lab.labId)
}

function handleCleanup(): void {
  if (!props.lab) return
  emit('cleanup', props.lab.labId)
}
</script>

<template>
  <Transition name="alert">
    <div v-if="visible" :class="styles['orphan-alert']">
      <div :class="styles['alert-content']">
        <div :class="styles['alert-message']">
          <span :class="styles['alert-eyebrow']">运行异常</span>
          <h4>容器已丢失</h4>
          <p>
            实验室「{{ lab?.name }}」关联的容器不再可用。这通常意味着容器被手动删除，或 Docker
            服务在重启后未恢复到原状态。
          </p>

          <div :class="styles['alert-meta']">
            <span v-if="lab?.composeProjectName" :class="styles['alert-meta-item']">
              Compose 项目 {{ lab.composeProjectName }}
            </span>
            <span v-if="lab?.frontend?.volumeName" :class="styles['alert-meta-item']">
              工作区 Volume {{ lab.frontend.volumeName }}
            </span>
          </div>
        </div>

        <div :class="styles['alert-actions']">
          <button
            v-if="canRecover"
            :class="styles['btn-primary']"
            :disabled="isReloading || isRecovering"
            @click="handleRecover"
          >
            <span v-if="isRecovering">{{ recoveringLabel }}</span>
            <span v-else>{{ recoverLabel || '重新关联容器' }}</span>
          </button>
          <button :class="styles['btn-danger']" :disabled="isReloading" @click="handleCleanup">
            清理实验室
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
