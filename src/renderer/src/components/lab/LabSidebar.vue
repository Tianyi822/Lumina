<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStateStore, useLabStore } from '@renderer/stores'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome.vue'
import LabList from './LabList.vue'
import type { LabListItem } from '@renderer/types/lab'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const props = defineProps<{
  labs: LabListItem[]
  activeLabId?: string
  listUpdateKey?: number
  deletingLabId?: string | null
}>()

const emit = defineEmits<{
  (e: 'select-lab', labId: string): void
  (e: 'delete-lab', labId: string): void
}>()

const uiStateStore = useUIStateStore()
const labStore = useLabStore()

const searchQuery = ref('')
const isRefreshing = ref(false)

const filteredLabs = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.labs
  }
  const query = searchQuery.value.toLowerCase()
  return props.labs.filter((lab) => lab.name.toLowerCase().includes(query))
})

function handleNewLab(): void {
  uiStateStore.openLabCreator()
}

function handleManageConfigs(): void {
  uiStateStore.openConfigManager()
}

function handleSelectLab(labId: string): void {
  emit('select-lab', labId)
}

function handleDeleteLab(labId: string): void {
  emit('delete-lab', labId)
}

async function handleRefreshList(): Promise<void> {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    // 刷新实验室列表
    await labStore.refreshLabList()

    // 如果有选中的实验室，强制重新加载其容器详情
    if (props.activeLabId) {
      await labStore.loadLab(props.activeLabId, true)
    }
  } finally {
    isRefreshing.value = false
  }
}
</script>

<template>
  <aside class="lab-sidebar sm-sidebar-shell">
    <WorkspaceSidebarChrome :count="labs.length">
      <template #actions>
        <button class="sm-button sm-button--primary new-lab-btn" @click="handleNewLab">
          创建实验室
        </button>
        <button
          class="sm-button sm-button--secondary manage-config-btn"
          @click="handleManageConfigs"
        >
          管理配置
        </button>
      </template>
    </WorkspaceSidebarChrome>

    <div class="sm-sidebar-shell__search search-container">
      <input
        v-model="searchQuery"
        type="text"
        class="sm-input search-input"
        placeholder="搜索实验室"
      />
      <button
        class="sm-icon-button sm-lab-sidebar__refresh-button"
        title="刷新列表"
        :disabled="isRefreshing"
        @click="handleRefreshList"
      >
        <SvgIcon name="refresh" :size="14" :spin="isRefreshing" />
      </button>
    </div>

    <div class="sm-sidebar-shell__body sm-sidebar-shell__body--flush">
      <LabList
        :labs="filteredLabs"
        :active-lab-id="activeLabId"
        :deleting-lab-id="deletingLabId"
        @select="handleSelectLab"
        @delete="handleDeleteLab"
      />
    </div>
  </aside>
</template>

<style scoped>
.lab-sidebar {
  min-height: 0;
}

.new-lab-btn,
.manage-config-btn {
  width: 100%;
  min-height: 36px;
}

.search-container {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
}

.sm-lab-sidebar__refresh-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.sm-lab-sidebar__refresh-button:hover:not(:disabled) {
  background-color: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.sm-lab-sidebar__refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sm-lab-sidebar__refresh-button svg {
  display: block;
}
</style>
