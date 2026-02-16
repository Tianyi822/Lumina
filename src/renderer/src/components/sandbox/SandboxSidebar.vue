<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStateStore } from '@renderer/stores'
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

const searchQuery = ref('')

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
}

.search-input {
  width: 100%;
}
</style>
