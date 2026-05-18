<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { DeleteLabOptions, LabCreationType } from '@renderer/types/lab'
import { getDeleteDialogConfig } from '@renderer/utils/labPermissions'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import styles from './DeleteConfirmDialog.module.css'

// 实验室项接口
interface LabItem {
  labId: string
  name: string
  creationType?: LabCreationType
  containerIds?: string[]
  composeProjectName?: string
  hasWorkspace?: boolean
  workspaceName?: string
  metadataOnlyDelete?: boolean
}

const props = defineProps<{
  visible: boolean
  lab?: LabItem | null
  isDeleting?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', labId: string, options: DeleteLabOptions): void
}>()

const deleteContainers = ref(false)

// 使用工具函数获取对话框配置
const dialogConfig = computed(() => {
  if (!props.lab) return null
  return getDeleteDialogConfig(
    props.lab.creationType || 'existing',
    props.lab.containerIds?.length || 0,
    props.lab.name,
    { metadataOnly: props.lab.metadataOnlyDelete }
  )
})

// 根据实验室类型显示不同的确认内容
const confirmTitle = computed(() => dialogConfig.value?.title || '确认删除')
const confirmMessage = computed(() => dialogConfig.value?.message || '')
const showDeleteContainerOption = computed(() => dialogConfig.value?.showDeleteOption ?? false)
const deleteContainerLabel = computed(() => dialogConfig.value?.deleteOptionLabel || '')
const warningMessage = computed(() => dialogConfig.value?.warningMessage || '')
const typeTheme = computed(() => dialogConfig.value?.typeTheme || 'default')
const confirmButtonText = computed(() => dialogConfig.value?.confirmButtonText || '确认删除')

// 是否为 existing 类型
const isExistingType = computed(() => props.lab?.creationType === 'existing')
const isMetadataOnlyDelete = computed(() => props.lab?.metadataOnlyDelete === true)

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
  if (!props.lab || props.isDeleting) return

  const shouldDeleteContainers = isMetadataOnlyDelete.value ? false : deleteContainers.value

  emit('confirm', props.lab.labId, {
    deleteContainers: shouldDeleteContainers,
    deleteWorkspace: shouldDeleteContainers
  })
}
</script>

<template>
  <div v-if="visible" :class="styles['delete-confirm-overlay']" @click.self="handleClose">
    <div
      :class="[
        styles['delete-confirm-dialog'],
        styles[`theme-${typeTheme}`],
        { [styles['existing-type']]: isExistingType }
      ]"
    >
      <div :class="styles['dialog-header']">
        <h3>{{ confirmTitle }}</h3>
        <button :class="styles['close-btn']" :disabled="isDeleting" @click="handleClose">×</button>
      </div>

      <div :class="styles['dialog-body']">
        <div
          v-if="isMetadataOnlyDelete"
          :class="[styles['type-notice'], styles['type-notice--metadata-only']]"
        >
          <SvgIcon name="warning" :size="24" />
          <span>容器未连接 · 仅删除元数据</span>
        </div>

        <!-- existing 类型提示图标 -->
        <div v-else-if="isExistingType" :class="styles['type-notice']">
          <SvgIcon name="warning" :size="24" />
          <span>只读实验室 · 仅删除记录</span>
        </div>

        <p :class="styles['confirm-message']">{{ confirmMessage }}</p>

        <!-- 同时删除容器选项 -->
        <label v-if="showDeleteContainerOption" :class="styles['delete-option']">
          <input v-model="deleteContainers" type="checkbox" :disabled="isDeleting" />
          <span>{{ deleteContainerLabel }}</span>
        </label>

        <!-- 警告提示 -->
        <p
          v-if="warningMessage"
          :class="[styles['warning-message'], { [styles['info-message']]: isExistingType }]"
        >
          {{ warningMessage }}
        </p>
      </div>

      <div :class="styles['dialog-footer']">
        <button :class="styles['btn-cancel']" :disabled="isDeleting" @click="handleClose">
          取消
        </button>
        <button
          :class="[
            styles['btn-confirm'],
            { [styles['btn-safe']]: isExistingType, [styles['btn-loading']]: isDeleting }
          ]"
          :disabled="isDeleting"
          @click="handleConfirm"
        >
          <SvgIcon v-if="isDeleting" name="loading" :size="16" :spin="true" />
          <span>{{ isDeleting ? '删除中...' : confirmButtonText }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
