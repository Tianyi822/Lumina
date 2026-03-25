<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStateStore, useSandboxStore } from '@renderer/stores'
import SandboxList from './SandboxList.vue'
import type { SandboxListItem } from '@shared/types/sandbox'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const props = defineProps<{
  sandboxs: SandboxListItem[]
  activeSandboxId?: string
  listUpdateKey?: number
  deletingSandboxId?: string | null
}>()

const emit = defineEmits<{
  (e: 'select-sandbox', sandboxId: string): void
  (e: 'delete-sandbox', sandboxId: string): void
}>()

const uiStateStore = useUIStateStore()
const sandboxStore = useSandboxStore()

const searchQuery = ref('')
const isRefreshing = ref(false)

const filteredSandboxs = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.sandboxs
  }
  const query = searchQuery.value.toLowerCase()
  return props.sandboxs.filter((sandbox) => sandbox.name.toLowerCase().includes(query))
})

function handleNewSandbox(): void {
  uiStateStore.openSandboxCreator()
}

function handleManageConfigs(): void {
  uiStateStore.openConfigManager()
}

function handleSelectSandbox(sandboxId: string): void {
  emit('select-sandbox', sandboxId)
}

function handleDeleteSandbox(sandboxId: string): void {
  emit('delete-sandbox', sandboxId)
}

async function handleRefreshList(): Promise<void> {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    // 刷新沙箱列表
    await sandboxStore.refreshSandboxList()

    // 如果有选中的沙箱，强制重新加载其容器详情
    if (props.activeSandboxId) {
      await sandboxStore.loadSandbox(props.activeSandboxId, true)
    }
  } finally {
    isRefreshing.value = false
  }
}
</script>

<template>
  <aside class="sandbox-sidebar">
    <div class="sidebar-actions">
      <button class="btn-primary new-sandbox-btn" @click="handleNewSandbox">新建沙箱</button>
      <button class="manage-config-btn" @click="handleManageConfigs">管理配置</button>
    </div>

    <div class="search-container">
      <input
        v-model="searchQuery"
        type="text"
        class="input search-input"
        placeholder="搜索沙箱..."
      />
      <button
        class="btn-refresh"
        title="刷新列表"
        :disabled="isRefreshing"
        @click="handleRefreshList"
      >
        <SvgIcon name="refresh" :size="14" :spin="isRefreshing" />
      </button>
    </div>

    <SandboxList
      :sandboxs="filteredSandboxs"
      :active-sandbox-id="activeSandboxId"
      :deleting-sandbox-id="deletingSandboxId"
      @select="handleSelectSandbox"
      @delete="handleDeleteSandbox"
    />
  </aside>
</template>

<style scoped>
.sandbox-sidebar {
  width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--theme-bg);
  border-right: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.new-sandbox-btn,
.manage-config-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin: 0;
}

.new-sandbox-btn {
  background: #46aa8f;
  border-color: rgba(70, 170, 143, 0.4);
}

.new-sandbox-btn:hover {
  background: #3d9980;
}

.manage-config-btn {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  color: var(--theme-text);
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-family: var(--theme-font);
  cursor: pointer;
  transition: all 0.15s ease;
}

.manage-config-btn:hover {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
}

.search-container {
  padding: 0 12px 12px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  flex: 1;
}

.btn-refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-accent);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.btn-refresh:hover:not(:disabled) {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
  color: var(--theme-text);
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-refresh svg {
  display: block;
}
</style>
