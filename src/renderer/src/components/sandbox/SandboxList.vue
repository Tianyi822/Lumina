<script setup lang="ts">
import type { SandboxListItem, SandboxStatus } from '@shared/types/sandbox'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

// 创建类型 - 预留，待类型定义更新后使用

type SandboxCreationType = 'existing' | 'compose' | 'dockerfile'

// 扩展的列表项类型（包含新增字段）
interface ExtendedSandboxListItem extends Omit<
  SandboxListItem,
  'creationType' | 'containerCount' | 'isOrphan'
> {
  creationType?: SandboxCreationType
  containerIds?: string[]
  isOrphan?: boolean
  composeProjectName?: string
}

defineProps<{
  sandboxs: SandboxListItem[]
  activeSandboxId?: string
  deletingSandboxId?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', sandboxId: string): void
  (e: 'delete', sandboxId: string): void
}>()

function getStatusLabel(status: SandboxStatus): string {
  const labels: Record<SandboxStatus, string> = {
    creating: '创建中',
    running: '运行中',
    stopped: '已停止',
    error: '错误'
  }
  return labels[status] || status
}

function getStatusClass(status: SandboxStatus): string {
  return `status-${status}`
}

function getCreationTypeLabel(type?: SandboxCreationType): string {
  if (!type) return ''
  const labels: Record<SandboxCreationType, string> = {
    existing: '已有容器',
    compose: 'Compose',
    dockerfile: 'Dockerfile'
  }
  return labels[type] || type
}

function getCreationTypeClass(type?: SandboxCreationType): string {
  if (!type) return ''
  return `creation-type-${type}`
}

function getContainerCount(item: SandboxListItem): number {
  const extended = item as unknown as ExtendedSandboxListItem
  return extended.containerIds?.length || 0
}

function handleSelect(sandboxId: string): void {
  emit('select', sandboxId)
}

function handleDeleteClick(sandbox: SandboxListItem): void {
  emit('delete', sandbox.sandboxId)
}
</script>

<template>
  <div class="sandbox-list">
    <div v-if="sandboxs.length === 0" class="empty-list">暂无沙箱</div>

    <div
      v-for="sandbox in sandboxs"
      :key="sandbox.sandboxId"
      class="sandbox-item"
      :class="{
        active: sandbox.sandboxId === activeSandboxId,
        orphan: (sandbox as unknown as ExtendedSandboxListItem).isOrphan
      }"
      @click="handleSelect(sandbox.sandboxId)"
    >
      <div class="sandbox-info">
        <div class="sandbox-name">
          {{ sandbox.name }}
        </div>
        <div class="sandbox-meta">
          <span class="sandbox-status" :class="getStatusClass(sandbox.status)">
            {{ getStatusLabel(sandbox.status) }}
          </span>
          <!-- 创建类型 Badge -->
          <span
            v-if="(sandbox as unknown as ExtendedSandboxListItem).creationType"
            class="creation-type-badge"
            :class="
              getCreationTypeClass((sandbox as unknown as ExtendedSandboxListItem).creationType)
            "
          >
            {{ getCreationTypeLabel((sandbox as unknown as ExtendedSandboxListItem).creationType) }}
          </span>
          <!-- 孤儿沙箱警告 -->
          <span
            v-if="(sandbox as unknown as ExtendedSandboxListItem).isOrphan"
            class="orphan-badge"
            title="容器已丢失"
          >
            ⚠️ 容器已丢失
          </span>
          <!-- 容器数量 -->
          <span
            v-if="getContainerCount(sandbox) > 1"
            class="container-count"
            :title="`包含 ${getContainerCount(sandbox)} 个容器`"
          >
            {{ getContainerCount(sandbox) }} 容器
          </span>
        </div>
      </div>

      <button
        class="btn-delete"
        :class="{ 'is-deleting': sandbox.sandboxId === deletingSandboxId }"
        title="删除沙箱"
        :disabled="sandbox.sandboxId === deletingSandboxId"
        @click.stop="handleDeleteClick(sandbox)"
      >
        <SvgIcon
          v-if="sandbox.sandboxId === deletingSandboxId"
          name="loading"
          :size="14"
          :spin="true"
        />
        <SvgIcon v-else name="trash" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.sandbox-list {
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

.sandbox-item {
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

.sandbox-item:hover {
  background-color: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.sandbox-item.active {
  border-color: var(--sm-color-border-accent);
  background-color: rgba(142, 149, 217, 0.12);
}

.sandbox-item.orphan {
  border-color: var(--theme-danger);
  background-color: rgba(199, 120, 120, 0.08);
  opacity: 0.7;
}

.sandbox-item.orphan:hover {
  border-color: var(--theme-danger);
  background-color: rgba(199, 120, 120, 0.12);
  opacity: 0.85;
}

.sandbox-info {
  flex: 1;
  min-width: 0;
}

.sandbox-name {
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

.creation-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: 999px;
  flex-shrink: 0;
}

.creation-type-badge.creation-type-existing {
  border-color: rgba(197, 161, 101, 0.32);
  color: var(--theme-warning);
  background-color: rgba(197, 161, 101, 0.12);
}

.creation-type-badge.creation-type-compose {
  border-color: rgba(127, 176, 138, 0.28);
  background-color: rgba(127, 176, 138, 0.12);
  color: var(--theme-success);
}

.creation-type-badge.creation-type-dockerfile {
  border-color: rgba(142, 149, 217, 0.28);
  background-color: rgba(142, 149, 217, 0.12);
  color: var(--theme-info);
}

.sandbox-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.sandbox-status {
  font-size: 12px;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 999px;
}

.status-creating {
  border-color: rgba(142, 149, 217, 0.28);
  background-color: rgba(142, 149, 217, 0.12);
  color: var(--theme-info);
}

.status-running {
  border-color: rgba(127, 176, 138, 0.28);
  background-color: rgba(127, 176, 138, 0.12);
  color: var(--theme-success);
}

.status-stopped {
  border-color: var(--sm-color-border-default);
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--sm-color-text-secondary);
}

.status-error {
  border-color: rgba(199, 120, 120, 0.28);
  background-color: rgba(199, 120, 120, 0.12);
  color: var(--theme-danger);
}

.orphan-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background-color: rgba(199, 120, 120, 0.12);
  color: var(--theme-danger);
  border: 1px solid rgba(199, 120, 120, 0.28);
}

.container-count {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--sm-color-text-secondary);
}

.btn-delete {
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

.btn-delete:hover:not(:disabled) {
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: var(--theme-danger);
}

.btn-delete:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.btn-delete.is-deleting {
  border-color: rgba(197, 161, 101, 0.32);
  color: var(--theme-warning);
}

.delete-confirm {
  display: flex;
  gap: 4px;
}

.btn-confirm,
.btn-cancel {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
}

.btn-confirm {
  background-color: rgba(199, 120, 120, 0.12);
  border: 1px solid rgba(199, 120, 120, 0.28);
  color: var(--theme-danger);
}

.btn-cancel {
  background-color: transparent;
  border: 1px solid var(--sm-color-border-default);
  color: var(--sm-color-text-secondary);
}
</style>
