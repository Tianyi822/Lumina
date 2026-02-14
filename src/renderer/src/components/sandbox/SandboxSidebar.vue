<script setup lang="ts">
import { ref, computed } from 'vue'
import SandboxList from './SandboxList.vue'
import type { SandboxListItem } from '@shared/types/sandbox'

const props = defineProps<{
  sandboxs: SandboxListItem[]
  activeSandboxId?: string
  listUpdateKey?: number
}>()

const emit = defineEmits<{
  (e: 'new-sandbox'): void
  (e: 'select-sandbox', sandboxId: string): void
  (e: 'delete-sandbox', sandboxId: string): void
}>()

const searchQuery = ref('')

const filteredSandboxs = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.sandboxs
  }
  const query = searchQuery.value.toLowerCase()
  return props.sandboxs.filter((sandbox) => sandbox.name.toLowerCase().includes(query))
})

function handleNewSandbox(): void {
  emit('new-sandbox')
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
    <button class="btn-primary new-sandbox-btn" @click="handleNewSandbox">新建沙箱</button>

    <div class="search-container">
      <input
        v-model="searchQuery"
        type="text"
        class="input search-input"
        placeholder="搜索沙箱 ..."
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

.new-sandbox-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 12px;
  width: calc(100% - 24px);
}

.search-container {
  padding: 0 12px 12px;
}

.search-input {
  width: 100%;
}
</style>
