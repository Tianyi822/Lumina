<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useSandboxCreatorStore } from '@renderer/stores'
import type { ContainerInfo } from '@shared/types/sandbox'

const containerStore = useContainerStore()
const creatorStore = useSandboxCreatorStore()

const { isLoading: storeLoading, containers } = storeToRefs(containerStore)
const {
  containerSearchQuery,
  containerFilter,
  selectedContainerId,
  filteredContainers,
  runningCount,
  stoppedCount
} = storeToRefs(creatorStore)

/** 展开详情的容器 ID */
const expandedContainerId = ref<string | null>(null)

const emit = defineEmits<{
  (e: 'select', containerId: string): void
  (e: 'view-details', container: ContainerInfo): void
}>()

/** 点击容器卡片只高亮选中 */
function handleClickContainer(containerId: string): void {
  creatorStore.selectContainer(containerId)
}

/** 点击详情按钮 */
function handleViewDetails(container: ContainerInfo, event: Event): void {
  event.stopPropagation()
  expandedContainerId.value = expandedContainerId.value === container.id ? null : container.id
  emit('view-details', container)
}

/** 获取选中的容器信息 */
const selectedContainer = computed(() => {
  if (!selectedContainerId.value) return null
  return filteredContainers.value.find((c) => c.id === selectedContainerId.value)
})

defineExpose({
  reset: () => {
    creatorStore.resetContainerSelector()
    expandedContainerId.value = null
  },
  selectedContainerId,
  selectedContainer
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
          @click="containerStore.loadContainers()"
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
          running: container.state === 'running',
          expanded: container.id === expandedContainerId
        }"
        @click="handleClickContainer(container.id)"
      >
        <div class="container-header">
          <div class="container-title">
            <span
              class="state-indicator"
              :class="containerStore.getStateClass(container.state)"
            ></span>
            <span class="container-name">{{
              container.names[0]?.replace(/^\//, '') || '未命名'
            }}</span>
          </div>
          <div class="container-actions">
            <button
              class="btn-detail"
              :class="{ active: container.id === expandedContainerId }"
              title="查看详情"
              @click="handleViewDetails(container, $event)"
            >
              {{ container.id === expandedContainerId ? '收起' : '详情' }}
            </button>
            <span class="container-state" :class="containerStore.getStateClass(container.state)">
              {{ containerStore.getStateLabel(container.state) }}
            </span>
          </div>
        </div>

        <div class="container-info">
          <div class="info-row">
            <span class="info-label">镜像</span>
            <span class="info-value" :title="container.image">{{ container.image }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ containerStore.formatCreated(container.created) }}</span>
          </div>
        </div>

        <!-- 展开的详情面板 -->
        <div v-if="container.id === expandedContainerId" class="container-details">
          <div class="detail-row">
            <span class="detail-label">容器 ID</span>
            <span class="detail-value">{{ container.shortId }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">完整 ID</span>
            <span class="detail-value">{{ container.id }}</span>
          </div>
          <div v-if="container.ports && container.ports.length > 0" class="detail-row">
            <span class="detail-label">端口映射</span>
            <div class="ports-list">
              <span v-for="(port, idx) in container.ports" :key="idx" class="port-item">
                {{ port.hostPort }} -> {{ port.containerPort }}/{{ port.protocol }}
              </span>
            </div>
          </div>
          <div
            v-if="container.labels && Object.keys(container.labels).length > 0"
            class="detail-row"
          >
            <span class="detail-label">标签</span>
            <div class="labels-list">
              <span v-for="(value, key) in container.labels" :key="key" class="label-item">
                {{ key }}: {{ value }}
              </span>
            </div>
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
  border-bottom: 1px solid var(--sm-color-border-default);
  background-color: var(--sm-color-bg-app);
}

.search-section {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  font-family: var(--sm-font-sans);
  font-size: 13px;
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-primary);
}

.search-input:focus {
  outline: none;
  border-color: var(--sm-color-accent);
}

.refresh-btn {
  padding: 8px 12px;
  font-size: 14px;
  font-family: var(--sm-font-sans);
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  border-color: var(--sm-color-text-secondary);
  color: var(--sm-color-text-primary);
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
  font-family: var(--sm-font-sans);
  background-color: transparent;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-btn:hover {
  border-color: var(--sm-color-text-secondary);
  color: var(--sm-color-text-primary);
}

.filter-btn.active {
  background-color: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
  color: var(--sm-color-text-selected);
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
  color: var(--sm-color-text-secondary);
  gap: 16px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--sm-color-border-default);
  border-top-color: var(--sm-color-accent);
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
  color: var(--sm-color-text-secondary);
  text-align: center;
}

.empty-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
  margin: 0 0 8px 0;
}

.empty-desc {
  font-size: 14px;
  margin: 0;
}

.container-card {
  background-color: var(--sm-color-surface-1);
  border: 2px solid var(--sm-color-border-default);
  border-radius: 8px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.container-card:hover {
  border-color: var(--sm-color-text-secondary);
}

.container-card.active {
  border-color: var(--sm-color-border-selected);
  background-color: var(--sm-color-surface-selected);
}

.container-card.running {
  border-left: 3px solid var(--sm-color-status-success);
}

.container-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.container-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-detail {
  padding: 3px 8px;
  font-size: 11px;
  font-family: var(--sm-font-sans);
  background-color: transparent;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1;
}

.btn-detail:hover {
  border-color: var(--sm-color-accent);
  color: var(--sm-color-accent);
}

.btn-detail.active {
  background-color: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
  color: var(--sm-color-text-selected);
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
  color: var(--sm-color-text-primary);
}

.container-state {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;
  line-height: 1;
}

.state-created {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--sm-color-status-info);
}

.state-created.state-indicator {
  background-color: var(--sm-color-status-info);
}

.state-running {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--sm-color-status-success);
}

.state-running.state-indicator {
  background-color: var(--sm-color-status-success);
}

.state-paused {
  background-color: rgba(210, 153, 34, 0.2);
  color: var(--sm-color-status-warning);
}

.state-paused.state-indicator {
  background-color: var(--sm-color-status-warning);
}

.state-restarting {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--sm-color-status-info);
}

.state-restarting.state-indicator {
  background-color: var(--sm-color-status-info);
}

.state-removing {
  background-color: rgba(139, 148, 158, 0.2);
  color: var(--sm-color-text-secondary);
}

.state-removing.state-indicator {
  background-color: var(--sm-color-text-secondary);
}

.state-exited,
.state-dead {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--sm-color-status-danger);
}

.state-exited.state-indicator,
.state-dead.state-indicator {
  background-color: var(--sm-color-status-danger);
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
  color: var(--sm-color-text-secondary);
  min-width: 60px;
  flex-shrink: 0;
}

.info-value {
  color: var(--sm-color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 展开的详情面板 */
.container-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--sm-color-border-default);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 12px;
}

.detail-label {
  color: var(--sm-color-text-secondary);
  min-width: 70px;
  flex-shrink: 0;
}

.detail-value {
  color: var(--sm-color-text-primary);
  word-break: break-all;
  font-family: var(--sm-font-sans);
}

.ports-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.port-item {
  padding: 2px 8px;
  background-color: var(--sm-color-bg-app);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--sm-font-sans);
  color: var(--sm-color-accent);
}

.labels-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label-item {
  font-size: 11px;
  color: var(--sm-color-text-secondary);
  word-break: break-all;
}
</style>
