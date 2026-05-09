<script setup lang="ts">
import { computed } from 'vue'
import type {
  ContainerDetails,
  ContainerStats,
  ContainerState,
  LabCreationType
} from '@renderer/types/lab'
import { useLabPermissions } from '@renderer/composables/useLabPermissions'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

// ==================== Props & Emits ====================

const props = defineProps<{
  container: ContainerDetails | null
  stats: ContainerStats | null
  loading?: boolean
  refreshingStats?: boolean
  creationType?: LabCreationType | null // 实验室创建类型
  labName?: string // 实验室名称（用于格式化监控页面标题）
  startingContainer?: boolean // 启动中状态
  stoppingContainer?: boolean // 停止中状态
  restartingContainer?: boolean // 重启中状态
}>()

const emit = defineEmits<{
  (e: 'start'): void
  (e: 'stop'): void
  (e: 'restart'): void
  (e: 'remove'): void
  (e: 'open-terminal'): void
  (e: 'view-logs'): void
  (e: 'refresh-stats'): void
}>()

// ==================== Permissions ====================

const creationTypeComputed = computed(() => props.creationType)
const { typeMeta, showLifecycleButtons, isReadOnly } = useLabPermissions(creationTypeComputed)

// ==================== Computed ====================

const isRunning = computed(() => props.container?.state === 'running')

// 是否有任何操作正在进行
const isOperating = computed(
  () => props.startingContainer || props.stoppingContainer || props.restartingContainer
)

/**
 * 格式化监控页面标题
 * 对于 docker-compose 创建的实验室，格式为 "lab-docker-compose-[实验室名]"
 * 其他类型显示容器名称
 */
const headerTitle = computed(() => {
  // 如果是 compose 类型且有实验室名称，使用格式化标题
  if (props.creationType === 'compose' && props.labName) {
    // 处理特殊字符，确保标题安全显示
    const sanitizedName = props.labName.replace(/[<>"'&]/g, '')
    return `lab-docker-compose-${sanitizedName}`
  }

  // 默认显示容器名称
  return props.container?.names[0]?.replace(/^\//, '') || '未命名'
})

const formattedCpu = computed(() => {
  if (!props.stats) return '-'
  return `${props.stats.cpu.toFixed(2)}%`
})

const formattedMemory = computed(() => {
  if (!props.stats) return '-'
  const usage = formatBytes(props.stats.memory.usage)
  const limit = formatBytes(props.stats.memory.limit)
  const percent = props.stats.memory.percent.toFixed(1)
  return `${usage} / ${limit} (${percent}%)`
})

const formattedNetwork = computed(() => {
  if (!props.stats) return { rx: '-', tx: '-' }
  return {
    rx: formatBytes(props.stats.network.rxBytes),
    tx: formatBytes(props.stats.network.txBytes)
  }
})

const formattedBlockIO = computed(() => {
  if (!props.stats) return { read: '-', write: '-' }
  return {
    read: formatBytes(props.stats.blockIO.readBytes),
    write: formatBytes(props.stats.blockIO.writeBytes)
  }
})

const creationTypeLabel = computed(() => {
  const labelMap: Record<LabCreationType, string> = {
    existing: '已有容器',
    compose: 'Docker Compose',
    dockerfile: 'Dockerfile',
    ssh: 'SSH 远程服务器'
  }

  if (!props.creationType) {
    return '未指定'
  }

  return labelMap[props.creationType]
})

// 有主机端口映射的端口
const mappedPorts = computed(() => {
  if (!props.container?.ports) return []
  return props.container.ports.filter((p) => p.hostPort)
})

// 暴露但未映射到主机的端口
const exposedPorts = computed(() => {
  if (!props.container?.ports) return []
  return props.container.ports.filter((p) => !p.hostPort)
})

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatCreated(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

function formatEnv(env: string[]): string[] {
  if (!env || env.length === 0) return []
  return env
    .filter((e) => !e.includes('PASSWORD') && !e.includes('SECRET') && !e.includes('TOKEN'))
    .slice(0, 20)
}
</script>

<template>
  <div class="container-detail-panel">
    <div v-if="!container" class="empty-state">
      <div class="sm-empty empty-card">
        <h2>选择一个容器查看详情</h2>
        <p>这里会汇总运行状态、资源指标和工程元数据。</p>
      </div>
    </div>

    <template v-else>
      <section class="overview-panel">
        <div class="overview-panel__copy">
          <div class="overview-panel__headline">
            <div class="header-title">
              <span class="state-indicator" :class="getStateClass(container.state)"></span>
              <h2>{{ headerTitle }}</h2>
              <span class="state-badge" :class="getStateClass(container.state)">
                {{ getStateLabel(container.state) }}
              </span>
            </div>
            <div class="header-actions">
              <button class="btn" :disabled="!isRunning" @click="emit('open-terminal')">
                终端
              </button>
              <button class="btn" @click="emit('view-logs')">日志</button>

              <template v-if="showLifecycleButtons">
                <button
                  v-if="!isRunning"
                  class="btn success"
                  :disabled="isOperating"
                  @click="emit('start')"
                >
                  <SvgIcon v-if="startingContainer" name="loading" :size="14" :spin="true" />
                  <span>{{ startingContainer ? '启动中...' : '启动' }}</span>
                </button>
                <button v-else class="btn warning" :disabled="isOperating" @click="emit('stop')">
                  <SvgIcon v-if="stoppingContainer" name="loading" :size="14" :spin="true" />
                  <span>{{ stoppingContainer ? '停止中...' : '停止' }}</span>
                </button>
                <button class="btn" :disabled="isOperating" @click="emit('restart')">
                  <SvgIcon v-if="restartingContainer" name="loading" :size="14" :spin="true" />
                  <span>{{ restartingContainer ? '重启中...' : '重启' }}</span>
                </button>
              </template>

              <span v-else-if="isReadOnly" class="read-only-hint" :title="typeMeta?.description">
                <SvgIcon name="info" :size="14" />
                只读模式
              </span>

              <button class="btn danger" @click="emit('remove')">删除</button>
            </div>
          </div>

          <div class="overview-meta">
            <span class="badge">{{ creationTypeLabel }}</span>
            <span class="badge overview-meta__code">ID {{ container.shortId }}</span>
            <span class="badge">创建于 {{ formatCreated(container.created) }}</span>
          </div>
        </div>
      </section>

      <section v-if="stats" class="detail-section">
        <div class="section-title-row">
          <h3 class="section-title">资源监控</h3>
          <button
            class="btn-refresh"
            type="button"
            title="刷新资源监控"
            aria-label="刷新资源监控"
            :disabled="refreshingStats"
            @click="emit('refresh-stats')"
          >
            <SvgIcon name="refresh" :size="14" :spin="refreshingStats" />
          </button>
        </div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">CPU 使用率</div>
            <div class="stat-value">{{ formattedCpu }}</div>
            <div class="stat-bar">
              <div
                class="stat-bar-fill cpu"
                :style="{ width: Math.min(stats.cpu, 100) + '%' }"
              ></div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">内存使用</div>
            <div class="stat-value">{{ formattedMemory }}</div>
            <div class="stat-bar">
              <div
                class="stat-bar-fill memory"
                :style="{ width: Math.min(stats.memory.percent, 100) + '%' }"
              ></div>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">网络接收</div>
            <div class="stat-value">{{ formattedNetwork.rx }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">网络发送</div>
            <div class="stat-value">{{ formattedNetwork.tx }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">块设备读取</div>
            <div class="stat-value">{{ formattedBlockIO.read }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">块设备写入</div>
            <div class="stat-value">{{ formattedBlockIO.write }}</div>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <h3 class="section-title">基本信息</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">容器 ID</span>
            <span class="info-value info-value--code">{{ container.id }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">短 ID</span>
            <span class="info-value info-value--code">{{ container.shortId }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">镜像</span>
            <span class="info-value info-value--code">{{ container.image }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatCreated(container.created) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">状态</span>
            <span class="info-value">{{ container.status }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">工作目录</span>
            <span class="info-value info-value--code">{{ container.workingDir || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">命令</span>
            <span class="info-value info-value--code">{{ container.cmd?.join(' ') || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">入口点</span>
            <span class="info-value info-value--code">
              {{ container.entrypoint?.join(' ') || '-' }}
            </span>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <h3 class="section-title">端口映射</h3>
        <div v-if="mappedPorts.length > 0" class="ports-list">
          <div v-for="(port, index) in mappedPorts" :key="index" class="port-item">
            <span class="port-host">{{ port.hostPort }}</span>
            <span class="port-arrow">-></span>
            <span class="port-container">{{ port.containerPort }}/{{ port.protocol }}</span>
          </div>
        </div>
        <p v-else class="empty-text">无端口映射（容器未暴露到主机）</p>
      </section>

      <section v-if="exposedPorts.length > 0" class="detail-section">
        <h3 class="section-title">容器暴露端口</h3>
        <div class="ports-list exposed">
          <div v-for="(port, index) in exposedPorts" :key="index" class="port-item">
            <span class="port-container">{{ port.containerPort }}/{{ port.protocol }}</span>
            <span class="port-hint">(未映射)</span>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <h3 class="section-title">挂载点</h3>
        <div v-if="container.mounts && container.mounts.length > 0" class="mounts-list">
          <div v-for="(mount, index) in container.mounts" :key="index" class="mount-item">
            <span class="mount-type">[{{ mount.type }}]</span>
            <span class="mount-source">{{ mount.source }}</span>
            <span class="mount-arrow">-></span>
            <span class="mount-destination">{{ mount.destination }}</span>
            <span class="mount-mode">({{ mount.mode }})</span>
          </div>
        </div>
        <p v-else class="empty-text">无挂载点</p>
      </section>

      <section class="detail-section">
        <h3 class="section-title">环境变量（前20个，已过滤敏感信息）</h3>
        <div v-if="container.env && container.env.length > 0" class="env-list">
          <code v-for="(env, index) in formatEnv(container.env)" :key="index" class="env-item">
            {{ env }}
          </code>
        </div>
        <p v-else class="empty-text">无环境变量</p>
      </section>

      <section class="detail-section">
        <h3 class="section-title">网络配置</h3>
        <div v-if="container.networkSettings?.networks" class="networks-list">
          <div
            v-for="(network, name) in container.networkSettings.networks"
            :key="name"
            class="network-item"
          >
            <div class="network-name">{{ name }}</div>
            <div class="network-details">
              <span>IP: {{ network.ipAddress || '-' }}</span>
              <span>网关: {{ network.gateway || '-' }}</span>
              <span>MAC: {{ network.macAddress || '-' }}</span>
            </div>
          </div>
        </div>
        <p v-else class="empty-text">无网络配置</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.container-detail-panel {
  height: 100%;
  overflow-y: auto;
  -ms-overflow-style: none;
  scrollbar-width: none;
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
}

.container-detail-panel::-webkit-scrollbar {
  display: none;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-card {
  width: min(420px, 100%);
  background: var(--sm-color-surface-2);
  border-style: solid;
}

.empty-card h2 {
  margin: 0;
  font-size: 17px;
  color: var(--sm-color-text-primary);
}

.empty-card p {
  margin: 0;
  max-width: 340px;
  line-height: 1.6;
}

.overview-panel,
.detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  padding: var(--sm-space-5);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-2);
}

.overview-panel__copy {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.overview-panel__headline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
}

.header-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sm-space-3);
}

.header-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.state-indicator {
  width: 10px;
  height: 10px;
  border: 1px solid transparent;
  border-radius: 50%;
}

.state-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.overview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
}

.overview-meta__code {
  font-family: var(--sm-font-mono);
}

.state-badge.state-created,
.state-indicator.state-created {
  border-color: var(--sm-color-accent-28);
  background: var(--sm-color-accent-08);
  color: var(--sm-color-accent-hover);
}

.state-indicator.state-created {
  background: var(--sm-color-accent);
}

.state-badge.state-running,
.state-indicator.state-running {
  border-color: rgba(127, 176, 138, 0.28);
  background: rgba(127, 176, 138, 0.08);
  color: var(--sm-color-status-success);
}

.state-indicator.state-running {
  background: var(--sm-color-status-success);
}

.state-badge.state-paused,
.state-badge.state-restarting,
.state-indicator.state-paused,
.state-indicator.state-restarting {
  border-color: rgba(197, 161, 101, 0.28);
  background: rgba(197, 161, 101, 0.08);
  color: var(--sm-color-status-warning);
}

.state-indicator.state-paused,
.state-indicator.state-restarting {
  background: var(--sm-color-status-warning);
}

.state-badge.state-removing,
.state-badge.state-exited,
.state-badge.state-dead,
.state-indicator.state-removing,
.state-indicator.state-exited,
.state-indicator.state-dead {
  border-color: rgba(199, 120, 120, 0.28);
  background: rgba(199, 120, 120, 0.08);
  color: var(--sm-color-status-danger);
}

.state-indicator.state-removing,
.state-indicator.state-exited,
.state-indicator.state-dead {
  background: var(--sm-color-status-danger);
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--sm-space-2);
}

.btn {
  min-height: 32px;
}

.btn.success {
  background: rgba(127, 176, 138, 0.08);
  border-color: rgba(127, 176, 138, 0.28);
  color: var(--sm-color-status-success);
}

.btn.success:hover:not(:disabled) {
  background: rgba(127, 176, 138, 0.12);
  border-color: rgba(127, 176, 138, 0.4);
  color: var(--sm-color-status-success);
}

.btn.warning {
  background: rgba(197, 161, 101, 0.08);
  border-color: rgba(197, 161, 101, 0.28);
  color: var(--sm-color-status-warning);
}

.btn.warning:hover:not(:disabled) {
  background: rgba(197, 161, 101, 0.12);
  border-color: rgba(197, 161, 101, 0.4);
  color: var(--sm-color-status-warning);
}

.btn.danger {
  background: rgba(199, 120, 120, 0.08);
  border-color: rgba(199, 120, 120, 0.28);
  color: var(--sm-color-status-danger);
}

.btn.danger:hover:not(:disabled) {
  background: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.4);
  color: var(--sm-color-status-danger);
}

.read-only-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
  background: var(--sm-color-surface-1);
  border: 1px dashed var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  cursor: help;
}

.read-only-hint svg {
  color: var(--sm-color-status-warning);
  flex-shrink: 0;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  color: var(--sm-color-text-primary);
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  cursor: pointer;
  color: var(--sm-color-text-secondary);
  transition:
    color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.btn-refresh svg {
  flex-shrink: 0;
}

.btn-refresh:hover:not(:disabled) {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.empty-text {
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  font-style: italic;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sm-space-3);
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  padding: var(--sm-space-4);
}

.stat-label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--sm-color-text-primary);
  font-family: var(--sm-font-mono);
}

.stat-bar {
  height: 6px;
  background: var(--sm-color-bg-embedded);
  border-radius: 999px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  border-radius: 999px;
}

.stat-bar-fill.cpu {
  background: var(--sm-color-accent);
}

.stat-bar-fill.memory {
  background: var(--sm-color-status-success);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--sm-space-3);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
}

.info-label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.info-value {
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-primary);
  word-break: break-word;
}

.info-value--code {
  font-family: var(--sm-font-mono);
  font-size: 12px;
}

.ports-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.port-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: var(--sm-space-4);
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  font-family: var(--sm-font-mono);
  font-size: 13px;
}

.port-host,
.port-container {
  color: var(--sm-color-text-primary);
}

.port-host {
  color: var(--sm-color-accent-hover);
}

.port-arrow {
  color: var(--sm-color-text-secondary);
}

.ports-list.exposed .port-item {
  opacity: 0.78;
}

.port-hint {
  color: var(--sm-color-status-warning);
}

.mounts-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.mount-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: var(--sm-space-4);
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  font-family: var(--sm-font-mono);
  font-size: 12px;
}

.mount-type {
  color: var(--sm-color-accent-hover);
}

.mount-source,
.mount-destination {
  color: var(--sm-color-text-primary);
  word-break: break-all;
}

.mount-arrow,
.mount-mode {
  color: var(--sm-color-text-secondary);
}

.env-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--sm-space-3);
}

.env-item {
  display: block;
  padding: 12px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  font-family: var(--sm-font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-primary);
  word-break: break-all;
}

.networks-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.network-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  padding: var(--sm-space-4);
}

.network-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.network-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  font-size: 12px;
  font-family: var(--sm-font-mono);
  color: var(--sm-color-text-secondary);
}

@media (max-width: 840px) {
  .overview-panel__headline {
    flex-direction: column;
  }

  .header-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .overview-panel,
  .detail-section {
    padding: var(--sm-space-4);
  }

  .stats-grid,
  .info-grid,
  .env-list,
  .network-details {
    grid-template-columns: 1fr;
  }
}
</style>
