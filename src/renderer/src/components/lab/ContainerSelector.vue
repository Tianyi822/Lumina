<script setup lang="ts">
import { ref, computed } from 'vue'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import { useContainerStore, useLabCreatorStore } from '@renderer/stores'
import type { ContainerInfo } from '@renderer/types/lab'
import styles from './ContainerSelector.module.css'

const containerStore = useZustandStore(useContainerStore)
const creatorStore = useZustandStore(useLabCreatorStore)

const storeLoading = computed(() => containerStore.isLoading)
const containers = computed(() => containerStore.containers)
const containerSearchQuery = computed({
  get: () => creatorStore.containerSearchQuery,
  set: (v: string) => {
    creatorStore.setContainerSearchQuery(v)
  }
})
const containerFilter = computed({
  get: () => creatorStore.containerFilter,
  set: (v: 'all' | 'running' | 'stopped') => {
    creatorStore.setContainerFilter(v)
  }
})
const selectedContainerId = computed(() => creatorStore.selectedContainerId)
const filteredContainers = computed(() => creatorStore.getFilteredContainers())
const runningCount = computed(() => creatorStore.getRunningCount())
const stoppedCount = computed(() => creatorStore.getStoppedCount())

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
  <div :class="styles['container-selector-section']">
    <div :class="styles['browser-header']">
      <div :class="styles['search-section']">
        <input
          v-model="containerSearchQuery"
          type="text"
          :class="styles['search-input']"
          placeholder="搜索容器..."
        />
        <button
          :class="styles['refresh-btn']"
          :disabled="storeLoading"
          @click="containerStore.loadContainers()"
        >
          刷新
        </button>
      </div>

      <div :class="styles['filter-section']">
        <button
          :class="[styles['filter-btn'], { [styles['active']]: containerFilter === 'all' }]"
          @click="containerFilter = 'all'"
        >
          全部 ({{ containers.length }})
        </button>
        <button
          :class="[styles['filter-btn'], { [styles['active']]: containerFilter === 'running' }]"
          @click="containerFilter = 'running'"
        >
          运行中 ({{ runningCount }})
        </button>
        <button
          :class="[styles['filter-btn'], { [styles['active']]: containerFilter === 'stopped' }]"
          @click="containerFilter = 'stopped'"
        >
          已停止 ({{ stoppedCount }})
        </button>
      </div>
    </div>

    <div :class="styles['container-list']">
      <div v-if="storeLoading" :class="styles['loading-state']">
        <div :class="styles['loading-spinner']"></div>
        <p>加载容器中...</p>
      </div>

      <div v-else-if="filteredContainers.length === 0" :class="styles['empty-state']">
        <p :class="styles['empty-title']">暂无容器</p>
        <p :class="styles['empty-desc']">Docker 中没有发现容器，请使用其他方式创建实验室</p>
      </div>

      <div
        v-for="container in filteredContainers"
        :key="container.id"
        :class="[
          styles['container-card'],
          {
            [styles['active']]: container.id === selectedContainerId,
            [styles['running']]: container.state === 'running',
            [styles['expanded']]: container.id === expandedContainerId
          }
        ]"
        @click="handleClickContainer(container.id)"
      >
        <div :class="styles['container-header']">
          <div :class="styles['container-title']">
            <span
              :class="[
                styles['state-indicator'],
                styles[containerStore.getStateClass(container.state)]
              ]"
            ></span>
            <span :class="styles['container-name']">{{
              container.names[0]?.replace(/^\//, '') || '未命名'
            }}</span>
          </div>
          <div :class="styles['container-actions']">
            <button
              :class="[
                styles['btn-detail'],
                { [styles['active']]: container.id === expandedContainerId }
              ]"
              title="查看详情"
              @click="handleViewDetails(container, $event)"
            >
              {{ container.id === expandedContainerId ? '收起' : '详情' }}
            </button>
            <span
              :class="[
                styles['container-state'],
                styles[containerStore.getStateClass(container.state)]
              ]"
            >
              {{ containerStore.getStateLabel(container.state) }}
            </span>
          </div>
        </div>

        <div :class="styles['container-info']">
          <div :class="styles['info-row']">
            <span :class="styles['info-label']">镜像</span>
            <span :class="styles['info-value']" :title="container.image">{{
              container.image
            }}</span>
          </div>
          <div :class="styles['info-row']">
            <span :class="styles['info-label']">创建时间</span>
            <span :class="styles['info-value']">{{
              containerStore.formatCreated(container.created)
            }}</span>
          </div>
        </div>

        <!-- 展开的详情面板 -->
        <div v-if="container.id === expandedContainerId" :class="styles['container-details']">
          <div :class="styles['detail-row']">
            <span :class="styles['detail-label']">容器 ID</span>
            <span :class="styles['detail-value']">{{ container.shortId }}</span>
          </div>
          <div :class="styles['detail-row']">
            <span :class="styles['detail-label']">完整 ID</span>
            <span :class="styles['detail-value']">{{ container.id }}</span>
          </div>
          <div v-if="container.ports && container.ports.length > 0" :class="styles['detail-row']">
            <span :class="styles['detail-label']">端口映射</span>
            <div :class="styles['ports-list']">
              <span v-for="(port, idx) in container.ports" :key="idx" :class="styles['port-item']">
                {{ port.hostPort }} -> {{ port.containerPort }}/{{ port.protocol }}
              </span>
            </div>
          </div>
          <div
            v-if="container.labels && Object.keys(container.labels).length > 0"
            :class="styles['detail-row']"
          >
            <span :class="styles['detail-label']">标签</span>
            <div :class="styles['labels-list']">
              <span
                v-for="(value, key) in container.labels"
                :key="key"
                :class="styles['label-item']"
              >
                {{ key }}: {{ value }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
