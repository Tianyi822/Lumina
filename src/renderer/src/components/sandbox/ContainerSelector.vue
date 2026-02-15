<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSandboxStore } from '@renderer/stores'

const sandboxStore = useSandboxStore()
const { isLoading: storeLoading, containers } = storeToRefs(sandboxStore)

const {
  creatorContainerSearchQuery: containerSearchQuery,
  creatorContainerFilter: containerFilter,
  creatorSelectedContainerId: selectedContainerId,
  creatorFilteredContainers: filteredContainers,
  creatorRunningCount: runningCount,
  creatorStoppedCount: stoppedCount
} = storeToRefs(sandboxStore)

const emit = defineEmits<{
  (e: 'select', containerId: string): void
}>()

function handleSelectContainer(containerId: string): void {
  sandboxStore.creatorSelectContainer(containerId)
  if (selectedContainerId.value) {
    emit('select', selectedContainerId.value)
  }
}

defineExpose({
  reset: () => sandboxStore.creatorResetContainerSelector(),
  selectedContainerId
})
</script>

<template>
  <div class="container-selector-section">
    <div class="browser-header">
      <div class="search-section">
        <input
          v-model="containerSearchQuery"
          type="text"
          class="input search-input"
          placeholder="搜索容器..."
        />
        <button
          class="btn refresh-btn"
          :disabled="storeLoading"
          @click="sandboxStore.loadContainers()"
        >
          刷新
        </button>
      </div>

      <div class="filter-section">
        <button
          class="filter-btn"
          :class="{ active: containerFilter === 'all' }"
          @click="containerFilter = 'all'"
        >
          全部 ({{ containers.length }})
        </button>
        <button
          class="filter-btn"
          :class="{ active: containerFilter === 'running' }"
          @click="containerFilter = 'running'"
        >
          运行中 ({{ runningCount }})
        </button>
        <button
          class="filter-btn"
          :class="{ active: containerFilter === 'stopped' }"
          @click="containerFilter = 'stopped'"
        >
          已停止 ({{ stoppedCount }})
        </button>
      </div>
    </div>

    <div class="container-list">
      <div v-if="storeLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>加载容器中...</p>
      </div>

      <div v-else-if="filteredContainers.length === 0" class="empty-state">
        <p class="empty-title">暂无容器</p>
        <p class="empty-desc">Docker 中没有发现容器，请使用其他方式创建沙箱</p>
      </div>

      <div
        v-for="container in filteredContainers"
        :key="container.id"
        class="container-card"
        :class="{
          active: container.id === selectedContainerId,
          running: container.state === 'running'
        }"
        @click="handleSelectContainer(container.id)"
      >
        <div class="container-header">
          <div class="container-title">
            <span
              class="state-indicator"
              :class="sandboxStore.getStateClass(container.state)"
            ></span>
            <span class="container-name">{{
              container.names[0]?.replace(/^\//, '') || '未命名'
            }}</span>
          </div>
          <span class="container-state" :class="sandboxStore.getStateClass(container.state)">
            {{ sandboxStore.getStateLabel(container.state) }}
          </span>
        </div>

        <div class="container-info">
          <div class="info-row">
            <span class="info-label">镜像</span>
            <span class="info-value" :title="container.image">{{ container.image }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ sandboxStore.formatCreated(container.created) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container-selector-section {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.browser-header {
  padding: 16px;
  border-bottom: 1px solid var(--theme-border);
  background-color: var(--theme-bg);
}

.search-section {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  font-family: var(--theme-font);
  font-size: 13px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
}

.search-input:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.refresh-btn {
  padding: 8px 12px;
  font-size: 14px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.filter-section {
  display: flex;
  gap: 8px;
}

.filter-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:hover {
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.filter-btn.active {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-bg);
}

.container-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--theme-text-secondary);
  gap: 16px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--theme-text-secondary);
  text-align: center;
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.empty-desc {
  font-size: 14px;
  margin: 0;
}

.container-card {
  background-color: var(--theme-bg-secondary);
  border: 2px solid var(--theme-border);
  border-radius: 8px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.container-card:hover {
  border-color: var(--theme-text-secondary);
}

.container-card.active {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.1);
}

.container-card.running {
  border-left: 3px solid var(--theme-success);
}

.container-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.container-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.state-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.container-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

.container-state {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.state-created {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-info);
}

.state-created.state-indicator {
  background-color: var(--theme-info);
}

.state-running {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-success);
}

.state-running.state-indicator {
  background-color: var(--theme-success);
}

.state-paused {
  background-color: rgba(210, 153, 34, 0.2);
  color: var(--theme-warning);
}

.state-paused.state-indicator {
  background-color: var(--theme-warning);
}

.state-restarting {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-info);
}

.state-restarting.state-indicator {
  background-color: var(--theme-info);
}

.state-removing {
  background-color: rgba(139, 148, 158, 0.2);
  color: var(--theme-text-secondary);
}

.state-removing.state-indicator {
  background-color: var(--theme-text-secondary);
}

.state-exited,
.state-dead {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--theme-danger);
}

.state-exited.state-indicator,
.state-dead.state-indicator {
  background-color: var(--theme-danger);
}

.container-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.info-label {
  color: var(--theme-text-secondary);
  min-width: 60px;
  flex-shrink: 0;
}

.info-value {
  color: var(--theme-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
