<script setup lang="ts">
import { ref } from 'vue'
import type { SandboxListItem, SandboxStatus } from '@shared/types/sandbox'

defineProps<{
  sandboxs: SandboxListItem[]
  activeSandboxId?: string
}>()

const emit = defineEmits<{
  (e: 'select', sandboxId: string): void
  (e: 'delete', sandboxId: string): void
}>()

const showDeleteConfirm = ref<string | null>(null)

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

function handleSelect(sandboxId: string): void {
  emit('select', sandboxId)
}

function handleDeleteClick(sandboxId: string): void {
  showDeleteConfirm.value = sandboxId
}

function handleConfirmDelete(sandboxId: string): void {
  emit('delete', sandboxId)
  showDeleteConfirm.value = null
}

function handleCancelDelete(): void {
  showDeleteConfirm.value = null
}
</script>

<template>
  <div class="sandbox-list">
    <div v-if="sandboxs.length === 0" class="empty-list">暂无沙箱</div>

    <div
      v-for="sandbox in sandboxs"
      :key="sandbox.sandboxId"
      class="sandbox-item"
      :class="{ active: sandbox.sandboxId === activeSandboxId }"
      @click="handleSelect(sandbox.sandboxId)"
    >
      <div class="sandbox-info">
        <div class="sandbox-name">{{ sandbox.name }}</div>
        <div class="sandbox-meta">
          <span class="sandbox-status" :class="getStatusClass(sandbox.status)">
            {{ getStatusLabel(sandbox.status) }}
          </span>
        </div>
      </div>

      <div v-if="showDeleteConfirm === sandbox.sandboxId" class="delete-confirm">
        <button class="btn-confirm" @click.stop="handleConfirmDelete(sandbox.sandboxId)">
          确认
        </button>
        <button class="btn-cancel" @click.stop="handleCancelDelete">取消</button>
      </div>

      <button
        v-else
        class="btn-delete"
        title="删除沙箱"
        @click.stop="handleDeleteClick(sandbox.sandboxId)"
      >
        x
      </button>
    </div>
  </div>
</template>

<style scoped>
.sandbox-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px;
}

.empty-list {
  padding: 24px;
  text-align: center;
  color: var(--theme-text-secondary);
  font-size: 14px;
}

.sandbox-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 8px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sandbox-item:hover {
  border-color: var(--theme-text-secondary);
}

.sandbox-item.active {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.1);
}

.sandbox-info {
  flex: 1;
  min-width: 0;
}

.sandbox-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sandbox-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.sandbox-status {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 3px;
}

.status-creating {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-info);
}

.status-running {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-success);
}

.status-stopped {
  background-color: rgba(139, 148, 158, 0.2);
  color: var(--theme-text-secondary);
}

.status-error {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--theme-danger);
}

.btn-delete {
  padding: 4px 8px;
  font-size: 12px;
  background-color: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-delete:hover {
  background-color: var(--theme-danger);
  border-color: var(--theme-danger);
  color: white;
}

.delete-confirm {
  display: flex;
  gap: 4px;
}

.btn-confirm,
.btn-cancel {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-confirm {
  background-color: var(--theme-danger);
  border: 1px solid var(--theme-danger);
  color: white;
}

.btn-cancel {
  background-color: transparent;
  border: 1px solid var(--theme-border);
  color: var(--theme-text-secondary);
}
</style>
