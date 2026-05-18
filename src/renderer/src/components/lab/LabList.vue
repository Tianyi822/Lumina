<script setup lang="ts">
import type { LabListItem, LabStatus } from '@renderer/types/lab'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import styles from './LabList.module.css'

// 创建类型 - 预留，待类型定义更新后使用

type LabCreationType = 'existing' | 'compose' | 'dockerfile' | 'ssh'

// 扩展的列表项类型（包含新增字段）
interface ExtendedLabListItem extends Omit<
  LabListItem,
  'creationType' | 'containerCount' | 'isOrphan'
> {
  creationType?: LabCreationType
  containerIds?: string[]
  isOrphan?: boolean
  composeProjectName?: string
}

defineProps<{
  labs: LabListItem[]
  activeLabId?: string
  deletingLabId?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', labId: string): void
  (e: 'delete', labId: string): void
}>()

function getStatusLabel(status: LabStatus, creationType?: LabCreationType): string {
  if (creationType === 'ssh') {
    const sshLabels: Record<LabStatus, string> = {
      creating: '连接中',
      running: '已连接',
      stopped: '未连接',
      error: '连接失败'
    }
    return sshLabels[status] || status
  }
  const labels: Record<LabStatus, string> = {
    creating: '创建中',
    running: '运行中',
    stopped: '已停止',
    error: '错误'
  }
  return labels[status] || status
}

function getStatusClass(status: LabStatus): string {
  return `status-${status}`
}

function getCreationTypeLabel(type?: LabCreationType): string {
  if (!type) return ''
  const labels: Record<LabCreationType, string> = {
    existing: '已有容器',
    compose: 'Compose',
    dockerfile: 'Dockerfile',
    ssh: 'SSH'
  }
  return labels[type] || type
}

function getCreationTypeClass(type?: LabCreationType): string {
  if (!type) return ''
  return `creation-type-${type}`
}

function getContainerCount(item: LabListItem): number {
  const extended = item as unknown as ExtendedLabListItem
  return extended.containerIds?.length || 0
}

function handleSelect(labId: string): void {
  emit('select', labId)
}

function handleDeleteClick(lab: LabListItem): void {
  emit('delete', lab.labId)
}
</script>

<template>
  <TransitionGroup
    v-if="labs.length > 0"
    name="sm-sidebar-list-item"
    tag="div"
    :class="styles['lab-list']"
    appear
  >
    <div
      v-for="(lab, index) in labs"
      :key="lab.labId"
      :class="[
        styles['lab-item'],
        {
          [styles['active']]: lab.labId === activeLabId,
          [styles['orphan']]: (lab as unknown as ExtendedLabListItem).isOrphan
        }
      ]"
      :style="getSidebarListItemMotionStyle(index)"
      @click="handleSelect(lab.labId)"
    >
      <div :class="styles['lab-info']">
        <div :class="styles['lab-name']">
          {{ lab.name }}
        </div>
        <div :class="styles['lab-meta']">
          <span :class="[styles['lab-status'], styles[getStatusClass(lab.status)]]">
            {{ getStatusLabel(lab.status, (lab as unknown as ExtendedLabListItem).creationType) }}
          </span>
          <!-- 创建类型 Badge -->
          <span
            v-if="(lab as unknown as ExtendedLabListItem).creationType"
            :class="[
              styles['sm-lab-list__creation-badge'],
              styles[getCreationTypeClass((lab as unknown as ExtendedLabListItem).creationType)]
            ]"
          >
            {{ getCreationTypeLabel((lab as unknown as ExtendedLabListItem).creationType) }}
          </span>
          <!-- 孤儿实验室警告 -->
          <span
            v-if="(lab as unknown as ExtendedLabListItem).isOrphan"
            :class="styles['sm-lab-list__orphan-badge']"
            title="容器已丢失"
          >
            ⚠️ 容器已丢失
          </span>
          <!-- 容器数量 -->
          <span
            v-if="getContainerCount(lab) > 1"
            :class="styles['sm-lab-list__container-count']"
            :title="`包含 ${getContainerCount(lab)} 个容器`"
          >
            {{ getContainerCount(lab) }} 容器
          </span>
        </div>
      </div>

      <button
        :class="[
          styles['sm-lab-list__delete-button'],
          { [styles['is-deleting']]: lab.labId === deletingLabId }
        ]"
        title="删除实验室"
        :disabled="lab.labId === deletingLabId"
        @click.stop="handleDeleteClick(lab)"
      >
        <SvgIcon v-if="lab.labId === deletingLabId" name="loading" :size="14" :spin="true" />
        <SvgIcon v-else name="trash" :size="14" />
      </button>
    </div>
  </TransitionGroup>

  <div v-else :class="styles['lab-list']">
    <div :class="styles['empty-list']">暂无实验室</div>
  </div>
</template>
