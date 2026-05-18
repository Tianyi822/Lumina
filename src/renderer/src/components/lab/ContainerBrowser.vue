<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ContainerInfo, ContainerState } from '@renderer/types/lab'
import styles from './ContainerBrowser.module.css'

// ==================== Props & Emits ====================

const props = defineProps<{
  containers: ContainerInfo[]
  selectedContainerId?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', containerId: string): void
  (e: 'refresh'): void
  (e: 'start', containerId: string): void
  (e: 'stop', containerId: string): void
  (e: 'restart', containerId: string): void
  (e: 'remove', containerId: string): void
  (e: 'select-as-lab', containerId: string): void
  (e: 'open-terminal', containerId: string): void
  (e: 'view-logs', containerId: string): void
  (e: 'filter-change', filter: 'all' | 'running' | 'stopped'): void
  (e: 'search', query: string): void
}>()

// ==================== State ====================

const searchQuery = ref('')
const activeFilter = ref<'all' | 'running' | 'stopped'>('all')

// ==================== Computed ====================

const runningCount = computed(() => props.containers.filter((c) => c.state === 'running').length)
const stoppedCount = computed(
  () => props.containers.filter((c) => c.state === 'exited' || c.state === 'dead').length
)

// ==================== Methods ====================

function getStateLabel(state: ContainerState): string {
  const labels: Record<ContainerState, string> = {
    created: '已创建',
    running: '运行中',
    paused: '已暂停',
    restarting: '重启中',
    removing: '删除中',
    exited: '已停止',
    dead: '已终止'
  }
  return labels[state] || state
}

function getStateClass(state: ContainerState): string {
  return `state-${state}`
}

function formatPorts(ports: ContainerInfo['ports']): string {
  if (!ports || ports.length === 0) return '-'
  return ports
    .filter((p) => p.hostPort)
    .map((p) => `${p.hostPort}:${p.containerPort}`)
    .join(', ')
}

function formatCreated(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

function handleSearch(): void {
  emit('search', searchQuery.value)
}

function setFilter(filter: 'all' | 'running' | 'stopped'): void {
  activeFilter.value = filter
  emit('filter-change', filter)
}

function handleSelect(containerId: string): void {
  emit('select', containerId)
}

function handleRefresh(): void {
  emit('refresh')
}

function handleStart(containerId: string): void {
  emit('start', containerId)
}

function handleStop(containerId: string): void {
  emit('stop', containerId)
}

function handleRestart(containerId: string): void {
  emit('restart', containerId)
}

function handleRemove(containerId: string): void {
  emit('remove', containerId)
}

function handleSelectAsLab(containerId: string): void {
  emit('select-as-lab', containerId)
}

function handleOpenTerminal(containerId: string): void {
  emit('open-terminal', containerId)
}

function handleViewLogs(containerId: string): void {
  emit('view-logs', containerId)
}
</script>

<template>
  <div :class="styles['container-browser']">
    <!-- 搜索和过滤栏 -->
    <div :class="styles['browser-header']">
      <div :class="styles['search-section']">
        <input
          v-model="searchQuery"
          type="text"
          :class="[styles['input'], styles['search-input']]"
          placeholder="搜索容器..."
          @input="handleSearch"
        />
        <button :class="[styles['btn'], styles['refresh-btn']]" title="刷新" @click="handleRefresh">
          刷新
        </button>
      </div>

      <div :class="styles['filter-section']">
        <button
          :class="[styles['filter-btn'], { [styles['active']]: activeFilter === 'all' }]"
          @click="setFilter('all')"
        >
          全部 ({{ containers.length }})
        </button>
        <button
          :class="[styles['filter-btn'], { [styles['active']]: activeFilter === 'running' }]"
          @click="setFilter('running')"
        >
          运行中 ({{ runningCount }})
        </button>
        <button
          :class="[styles['filter-btn'], { [styles['active']]: activeFilter === 'stopped' }]"
          @click="setFilter('stopped')"
        >
          已停止 ({{ stoppedCount }})
        </button>
      </div>
    </div>

    <!-- 容器列表 -->
    <div :class="styles['container-list']">
      <div v-if="loading" :class="styles['loading-state']">
        <div :class="styles['loading-spinner']"></div>
        <p>加载容器中...</p>
      </div>

      <div v-else-if="containers.length === 0" :class="styles['empty-state']">
        <p :class="styles['empty-title']">暂无容器</p>
        <p :class="styles['empty-desc']">Docker 中没有发现容器，请创建一个新容器</p>
      </div>

      <div
        v-for="container in containers"
        :key="container.id"
        :class="[
          styles['container-card'],
          {
            [styles['active']]: container.id === selectedContainerId,
            [styles['running']]: container.state === 'running'
          }
        ]"
        @click="handleSelect(container.id)"
      >
        <!-- 容器头部 -->
        <div :class="styles['container-header']">
          <div :class="styles['container-title']">
            <span
              :class="[styles['state-indicator'], styles[getStateClass(container.state)]]"
            ></span>
            <span :class="styles['container-name']">{{
              container.names[0]?.replace(/^\//, '') || '未命名'
            }}</span>
          </div>
          <span :class="[styles['container-state'], styles[getStateClass(container.state)]]">
            {{ getStateLabel(container.state) }}
          </span>
        </div>

        <!-- 容器信息 -->
        <div :class="styles['container-info']">
          <div :class="styles['info-row']">
            <span :class="styles['info-label']">镜像</span>
            <span :class="styles['info-value']" :title="container.image">{{
              container.image
            }}</span>
          </div>
          <div :class="styles['info-row']">
            <span :class="styles['info-label']">端口</span>
            <span :class="styles['info-value']">{{ formatPorts(container.ports) }}</span>
          </div>
          <div :class="styles['info-row']">
            <span :class="styles['info-label']">创建时间</span>
            <span :class="styles['info-value']">{{ formatCreated(container.created) }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div :class="styles['container-actions']">
          <button
            :class="[styles['action-btn'], styles['primary']]"
            :disabled="container.state !== 'running'"
            @click.stop="handleSelectAsLab(container.id)"
          >
            选择作为实验室
          </button>
          <button
            :class="styles['action-btn']"
            :disabled="container.state !== 'running'"
            @click.stop="handleOpenTerminal(container.id)"
          >
            终端
          </button>
          <button :class="styles['action-btn']" @click.stop="handleViewLogs(container.id)">
            日志
          </button>
          <button
            v-if="container.state !== 'running'"
            :class="[styles['action-btn'], styles['success']]"
            @click.stop="handleStart(container.id)"
          >
            启动
          </button>
          <button
            v-else
            :class="[styles['action-btn'], styles['warning']]"
            @click.stop="handleStop(container.id)"
          >
            停止
          </button>
          <button :class="styles['action-btn']" @click.stop="handleRestart(container.id)">
            重启
          </button>
          <button
            :class="[styles['action-btn'], styles['danger']]"
            @click.stop="handleRemove(container.id)"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
