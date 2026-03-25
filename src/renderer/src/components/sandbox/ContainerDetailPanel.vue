<script setup lang="ts">
import { computed } from 'vue'
import type {
  ContainerDetails,
  ContainerStats,
  ContainerState,
  SandboxCreationType
} from '@shared/types/sandbox'
import { useSandboxPermissions } from '@renderer/composables/useSandboxPermissions'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

// ==================== Props & Emits ====================

const props = defineProps<{
  container: ContainerDetails | null
  stats: ContainerStats | null
  loading?: boolean
  refreshingStats?: boolean
  creationType?: SandboxCreationType | null // 沙箱创建类型
  sandboxName?: string // 沙箱名称（用于格式化监控页面标题）
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
const { typeMeta, showLifecycleButtons, isReadOnly } = useSandboxPermissions(creationTypeComputed)

// ==================== Computed ====================

const isRunning = computed(() => props.container?.state === 'running')

/**
 * 格式化监控页面标题
 * 对于 docker-compose 创建的沙箱，格式为 "sandbox-docker-compose-[沙箱名]"
 * 其他类型显示容器名称
 */
const headerTitle = computed(() => {
  // 如果是 compose 类型且有沙箱名称，使用格式化标题
  if (props.creationType === 'compose' && props.sandboxName) {
    // 处理特殊字符，确保标题安全显示
    const sanitizedName = props.sandboxName.replace(/[<>"'&]/g, '')
    return `sandbox-docker-compose-${sanitizedName}`
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
      <p>选择一个容器查看详情</p>
    </div>

    <template v-else>
      <!-- 容器头部信息 -->
      <div class="panel-header">
        <div class="header-title">
          <span class="state-indicator" :class="getStateClass(container.state)"></span>
          <h2>{{ headerTitle }}</h2>
          <span class="state-badge" :class="getStateClass(container.state)">
            {{ getStateLabel(container.state) }}
          </span>
        </div>
        <div class="header-actions">
          <button class="btn" :disabled="!isRunning" @click="emit('open-terminal')">终端</button>
          <button class="btn" @click="emit('view-logs')">日志</button>

          <!-- 生命周期操作按钮：根据权限显示/隐藏 -->
          <template v-if="showLifecycleButtons">
            <button v-if="!isRunning" class="btn success" @click="emit('start')">启动</button>
            <button v-else class="btn warning" @click="emit('stop')">停止</button>
            <button class="btn" @click="emit('restart')">重启</button>
          </template>

          <!-- 只读模式提示：existing 类型显示 -->
          <span v-else-if="isReadOnly" class="read-only-hint" :title="typeMeta?.description">
            <SvgIcon name="info" :size="14" />
            只读模式
          </span>

          <button class="btn danger" @click="emit('remove')">删除</button>
        </div>
      </div>

      <!-- 资源监控 -->
      <div v-if="stats" class="stats-section">
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
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="info-section">
        <h3 class="section-title">基本信息</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">容器 ID</span>
            <span class="info-value">{{ container.id }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">短 ID</span>
            <span class="info-value">{{ container.shortId }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">镜像</span>
            <span class="info-value">{{ container.image }}</span>
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
            <span class="info-value">{{ container.workingDir || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">命令</span>
            <span class="info-value">{{ container.cmd?.join(' ') || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">入口点</span>
            <span class="info-value">{{ container.entrypoint?.join(' ') || '-' }}</span>
          </div>
        </div>
      </div>

      <!-- 端口映射 -->
      <div class="info-section">
        <h3 class="section-title">端口映射</h3>
        <div v-if="mappedPorts.length > 0" class="ports-list">
          <div v-for="(port, index) in mappedPorts" :key="index" class="port-item">
            <span class="port-host">{{ port.hostPort }}</span>
            <span class="port-arrow">-></span>
            <span class="port-container">{{ port.containerPort }}/{{ port.protocol }}</span>
          </div>
        </div>
        <p v-else class="empty-text">无端口映射（容器未暴露到主机）</p>
      </div>

      <!-- 暴露端口 -->
      <div v-if="exposedPorts.length > 0" class="info-section">
        <h3 class="section-title">容器暴露端口</h3>
        <div class="ports-list exposed">
          <div v-for="(port, index) in exposedPorts" :key="index" class="port-item">
            <span class="port-container">{{ port.containerPort }}/{{ port.protocol }}</span>
            <span class="port-hint">(未映射)</span>
          </div>
        </div>
      </div>

      <!-- 挂载点 -->
      <div class="info-section">
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
      </div>

      <!-- 环境变量 -->
      <div class="info-section">
        <h3 class="section-title">环境变量（前20个，已过滤敏感信息）</h3>
        <div v-if="container.env && container.env.length > 0" class="env-list">
          <code v-for="(env, index) in formatEnv(container.env)" :key="index" class="env-item">
            {{ env }}
          </code>
        </div>
        <p v-else class="empty-text">无环境变量</p>
      </div>

      <!-- 网络配置 -->
      <div class="info-section">
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
      </div>
    </template>
  </div>
</template>

<style scoped>
.container-detail-panel {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--theme-text-secondary);
  text-align: center;
}

/* 头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--theme-border);
  margin-bottom: 24px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.state-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.state-badge {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 4px;
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

.header-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 6px 12px;
  font-size: 13px;
  font-family: var(--theme-font);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover:not(:disabled) {
  border-color: var(--theme-text-secondary);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.success {
  background-color: var(--theme-success);
  border-color: var(--theme-success);
  color: var(--theme-bg);
}

.btn.warning {
  background-color: var(--theme-warning);
  border-color: var(--theme-warning);
  color: var(--theme-bg);
}

.btn.danger {
  background-color: var(--theme-danger);
  border-color: var(--theme-danger);
  color: white;
}

/* 只读模式提示 */
.read-only-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--theme-text-secondary);
  background-color: var(--theme-bg-secondary);
  border: 1px dashed var(--theme-border);
  border-radius: 4px;
  cursor: help;
}

.read-only-hint svg {
  color: var(--theme-warning);
  flex-shrink: 0;
}

/* 通用区块样式 */
.info-section {
  margin-bottom: 24px;
}

/* 紧跟在 stats-section 后面的 info-section（基本信息） */
.stats-section + .info-section {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--theme-border);
}

.stats-section {
  margin-top: 16px;
}

.section-title {
  margin: 0 0 20px 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  color: var(--theme-text);
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.section-title-row > .section-title {
  margin-bottom: 0;
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--theme-text);
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.btn-refresh svg {
  flex-shrink: 0;
}

.btn-refresh:disabled {
  cursor: default;
  opacity: 0.72;
}

.btn-refresh:hover {
  color: var(--theme-accent);
}

.empty-text {
  color: var(--theme-text-secondary);
  font-size: 13px;
  font-style: italic;
}

/* 资源监控 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.stat-card {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  padding: 16px;
}

.stat-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  margin-bottom: 12px;
}

.stat-bar {
  height: 6px;
  background-color: var(--theme-border);
  border-radius: 3px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.stat-bar-fill.cpu {
  background-color: var(--theme-info);
}

.stat-bar-fill.memory {
  background-color: var(--theme-accent);
}

/* 基本信息网格 */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.info-value {
  font-size: 13px;
  color: var(--theme-text);
  word-break: break-all;
  font-family: var(--theme-font);
}

/* 端口列表 */
.ports-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.port-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  font-size: 13px;
  font-family: var(--theme-font);
}

.port-host {
  color: var(--theme-accent);
  font-weight: 500;
}

.port-arrow {
  color: var(--theme-text-secondary);
}

.port-container {
  color: var(--theme-text);
}

.ports-list.exposed .port-item {
  opacity: 0.7;
  border-style: dashed;
}

.port-hint {
  color: var(--theme-text-secondary);
  font-size: 12px;
  margin-left: 4px;
}

/* 挂载点列表 */
.mounts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mount-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  font-size: 13px;
  font-family: var(--theme-font);
  flex-wrap: wrap;
}

.mount-type {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.mount-source {
  color: var(--theme-accent);
}

.mount-arrow {
  color: var(--theme-text-secondary);
}

.mount-destination {
  color: var(--theme-text);
}

.mount-mode {
  color: var(--theme-warning);
  font-size: 11px;
}

/* 环境变量 */
.env-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.env-item {
  font-size: 12px;
  font-family: var(--theme-font);
  color: var(--theme-text);
  padding: 2px 0;
}

/* 网络配置 */
.networks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.network-item {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 12px;
}

.network-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text);
  margin-bottom: 8px;
}

.network-details {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 12px;
  font-family: var(--theme-font);
  color: var(--theme-text-secondary);
}
</style>
