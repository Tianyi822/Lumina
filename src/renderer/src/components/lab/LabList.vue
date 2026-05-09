<script setup lang="ts">
import type { LabListItem, LabStatus } from '@renderer/types/lab'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'

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
    class="lab-list"
    appear
  >
    <div
      v-for="(lab, index) in labs"
      :key="lab.labId"
      class="lab-item"
      :class="{
        active: lab.labId === activeLabId,
        orphan: (lab as unknown as ExtendedLabListItem).isOrphan
      }"
      :style="getSidebarListItemMotionStyle(index)"
      @click="handleSelect(lab.labId)"
    >
      <div class="lab-info">
        <div class="lab-name">
          {{ lab.name }}
        </div>
        <div class="lab-meta">
          <span class="lab-status" :class="getStatusClass(lab.status)">
            {{ getStatusLabel(lab.status, (lab as unknown as ExtendedLabListItem).creationType) }}
          </span>
          <!-- 创建类型 Badge -->
          <span
            v-if="(lab as unknown as ExtendedLabListItem).creationType"
            class="sm-badge sm-lab-list__creation-badge"
            :class="getCreationTypeClass((lab as unknown as ExtendedLabListItem).creationType)"
          >
            {{ getCreationTypeLabel((lab as unknown as ExtendedLabListItem).creationType) }}
          </span>
          <!-- 孤儿实验室警告 -->
          <span
            v-if="(lab as unknown as ExtendedLabListItem).isOrphan"
            class="sm-badge sm-lab-list__orphan-badge"
            title="容器已丢失"
          >
            ⚠️ 容器已丢失
          </span>
          <!-- 容器数量 -->
          <span
            v-if="getContainerCount(lab) > 1"
            class="sm-badge sm-lab-list__container-count"
            :title="`包含 ${getContainerCount(lab)} 个容器`"
          >
            {{ getContainerCount(lab) }} 容器
          </span>
        </div>
      </div>

      <button
        class="sm-icon-button sm-lab-list__delete-button"
        :class="{ 'is-deleting': lab.labId === deletingLabId }"
        title="删除实验室"
        :disabled="lab.labId === deletingLabId"
        @click.stop="handleDeleteClick(lab)"
      >
        <SvgIcon v-if="lab.labId === deletingLabId" name="loading" :size="14" :spin="true" />
        <SvgIcon v-else name="trash" :size="14" />
      </button>
    </div>
  </TransitionGroup>

  <div v-else class="lab-list">
    <div class="empty-list">暂无实验室</div>
  </div>
</template>

<style scoped>
.lab-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.empty-list {
  padding: 24px;
  text-align: center;
  color: var(--sm-color-text-secondary);
  font-size: 14px;
}

.lab-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin-bottom: 8px;
  background-color: var(--sm-color-surface-1);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    opacity var(--sm-transition-fast);
}

.lab-item:hover {
  background-color: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.lab-item.active {
  border-color: var(--sm-color-border-selected);
  background-color: var(--sm-color-surface-selected);
}

.lab-item.orphan {
  border-color: rgba(199, 120, 120, 0.32);
  background-color: rgba(199, 120, 120, 0.08);
}

.lab-item.orphan:hover {
  border-color: rgba(199, 120, 120, 0.32);
  background-color: rgba(199, 120, 120, 0.12);
}

.lab-info {
  flex: 1;
  min-width: 0;
}

.lab-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sm-lab-list__creation-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: 999px;
  flex-shrink: 0;
}

.sm-lab-list__creation-badge.creation-type-existing {
  border-color: rgba(197, 161, 101, 0.32);
  color: #c5a165;
  background-color: rgba(197, 161, 101, 0.12);
}

.sm-lab-list__creation-badge.creation-type-compose {
  border-color: rgba(127, 176, 138, 0.28);
  background-color: rgba(127, 176, 138, 0.12);
  color: #7fb08a;
}

.sm-lab-list__creation-badge.creation-type-dockerfile {
  border-color: var(--sm-color-accent-28);
  background-color: var(--sm-color-accent-12);
  color: var(--sm-color-accent-hover);
}

.sm-lab-list__creation-badge.creation-type-ssh {
  border-color: rgba(136, 132, 216, 0.32);
  background-color: rgba(136, 132, 216, 0.12);
  color: #8884d8;
}

.lab-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.lab-status {
  font-size: 12px;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 999px;
}

.status-creating {
  border-color: var(--sm-color-accent-28);
  background-color: var(--sm-color-accent-12);
  color: var(--sm-color-accent-hover);
}

.status-running {
  border-color: rgba(127, 176, 138, 0.28);
  background-color: rgba(127, 176, 138, 0.12);
  color: #7fb08a;
}

.status-stopped {
  border-color: var(--sm-color-border-default);
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--sm-color-text-secondary);
}

.status-error {
  border-color: rgba(199, 120, 120, 0.28);
  background-color: rgba(199, 120, 120, 0.12);
  color: #c77878;
}

.sm-lab-list__orphan-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background-color: rgba(199, 120, 120, 0.12);
  color: #c77878;
  border: 1px solid rgba(199, 120, 120, 0.28);
}

.sm-lab-list__container-count {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--sm-color-text-secondary);
}

.sm-lab-list__delete-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all var(--sm-transition-fast);
}

.sm-lab-list__delete-button:hover:not(:disabled) {
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: #c77878;
}

.sm-lab-list__delete-button:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.sm-lab-list__delete-button.is-deleting {
  border-color: rgba(197, 161, 101, 0.32);
  color: #c5a165;
}
</style>
