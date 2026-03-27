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
  <aside class="sandbox-sidebar sm-sidebar-shell">
    <header class="sm-sidebar-shell__header">
      <span class="sm-sidebar-shell__eyebrow">沙箱</span>
      <div class="sm-sidebar-shell__headline">
        <h2 class="sm-sidebar-shell__title">工程环境</h2>
        <span class="sm-sidebar-shell__count">{{ sandboxs.length }}</span>
      </div>
      <p class="sm-sidebar-shell__description">管理运行环境、容器状态和模板配置。</p>
      <div class="sm-sidebar-shell__actions">
        <button class="btn-primary new-sandbox-btn" @click="handleNewSandbox">新建沙箱</button>
        <button class="btn-secondary manage-config-btn" @click="handleManageConfigs">
          管理配置
        </button>
      </div>
    </header>

    <div class="sm-sidebar-shell__search search-container">
      <input v-model="searchQuery" type="text" class="input search-input" placeholder="搜索沙箱" />
      <button
        class="btn-refresh"
        title="刷新列表"
        :disabled="isRefreshing"
        @click="handleRefreshList"
      >
        <SvgIcon name="refresh" :size="14" :spin="isRefreshing" />
      </button>
    </div>

    <div class="sm-sidebar-shell__body sm-sidebar-shell__body--flush">
      <SandboxList
        :sandboxs="filteredSandboxs"
        :active-sandbox-id="activeSandboxId"
        :deleting-sandbox-id="deletingSandboxId"
        @select="handleSelectSandbox"
        @delete="handleDeleteSandbox"
      />
    </div>
  </aside>
</template>

<style scoped>
.sandbox-sidebar {
  min-height: 0;
}

.new-sandbox-btn,
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

.btn-refresh {
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

.btn-refresh:hover:not(:disabled) {
  background-color: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-refresh svg {
  display: block;
}
</style>
