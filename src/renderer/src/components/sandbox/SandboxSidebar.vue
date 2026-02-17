<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStateStore, useSandboxStore } from '@renderer/stores'
import SandboxList from './SandboxList.vue'
import type { SandboxListItem } from '@shared/types/sandbox'

const props = defineProps<{
  sandboxs: SandboxListItem[]
  activeSandboxId?: string
  listUpdateKey?: number
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
        <svg
          viewBox="0 0 1024 1024"
          width="14"
          height="14"
          :class="{ rotating: isRefreshing }"
        >
          <path
            d="M896 198.4 896 198.4l0 179.2 0 0c0 19.2-6.4 32-19.2 44.8-12.8 12.8-32 19.2-44.8 19.2l0 0-179.2 0 0 0c-19.2 0-32-6.4-44.8-19.2-25.6-25.6-25.6-64 0-89.6C620.8 320 633.6 313.6 652.8 313.6l0 0 25.6 0C627.2 275.2 576 256 518.4 256 441.6 256 377.6 281.6 332.8 332.8l0 0c-25.6 25.6-64 25.6-89.6 0-25.6-25.6-25.6-64 0-89.6l0 0C313.6 172.8 409.6 128 518.4 128c96 0 185.6 38.4 249.6 96L768 198.4l0 0c0-19.2 6.4-32 19.2-44.8 25.6-25.6 64-25.6 89.6 0C889.6 160 896 179.2 896 198.4zM416 691.2c-12.8 12.8-32 19.2-44.8 19.2l0 0L352 710.4C396.8 748.8 448 768 505.6 768c70.4 0 134.4-25.6 179.2-76.8l0 0c25.6-25.6 64-25.6 89.6 0 25.6 25.6 25.6 64 0 89.6l0 0C710.4 851.2 614.4 896 505.6 896c-96 0-185.6-38.4-249.6-96l0 32 0 0c0 19.2-6.4 32-19.2 44.8-25.6 25.6-64 25.6-89.6 0C134.4 864 128 844.8 128 825.6l0 0 0-179.2 0 0c0-19.2 6.4-32 19.2-44.8C160 588.8 172.8 582.4 192 582.4l0 0 179.2 0 0 0c19.2 0 32 6.4 44.8 19.2C441.6 627.2 441.6 665.6 416 691.2z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>

    <SandboxList
      :sandboxs="filteredSandboxs"
      :active-sandbox-id="activeSandboxId"
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

.btn-refresh svg.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
