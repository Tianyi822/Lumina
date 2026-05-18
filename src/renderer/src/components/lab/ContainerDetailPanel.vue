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
import styles from './ContainerDetailPanel.module.css'

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
  <div :class="styles['container-detail-panel']">
    <div v-if="!container" :class="styles['empty-state']">
      <div :class="['sm-empty', styles['empty-card']]">
        <h2>选择一个容器查看详情</h2>
        <p>这里会汇总运行状态、资源指标和工程元数据。</p>
      </div>
    </div>

    <template v-else>
      <section :class="styles['overview-panel']">
        <div :class="styles['overview-panel__copy']">
          <div :class="styles['overview-panel__headline']">
            <div :class="styles['header-title']">
              <span
                :class="[styles['state-indicator'], styles[getStateClass(container.state)]]"
              ></span>
              <h2>{{ headerTitle }}</h2>
              <span :class="[styles['state-badge'], styles[getStateClass(container.state)]]">
                {{ getStateLabel(container.state) }}
              </span>
            </div>
            <div :class="styles['header-actions']">
              <button :class="styles['btn']" :disabled="!isRunning" @click="emit('open-terminal')">
                终端
              </button>
              <button :class="styles['btn']" @click="emit('view-logs')">日志</button>

              <template v-if="showLifecycleButtons">
                <button
                  v-if="!isRunning"
                  :class="[styles['btn'], styles['success']]"
                  :disabled="isOperating"
                  @click="emit('start')"
                >
                  <SvgIcon v-if="startingContainer" name="loading" :size="14" :spin="true" />
                  <span>{{ startingContainer ? '启动中...' : '启动' }}</span>
                </button>
                <button
                  v-else
                  :class="[styles['btn'], styles['warning']]"
                  :disabled="isOperating"
                  @click="emit('stop')"
                >
                  <SvgIcon v-if="stoppingContainer" name="loading" :size="14" :spin="true" />
                  <span>{{ stoppingContainer ? '停止中...' : '停止' }}</span>
                </button>
                <button :class="styles['btn']" :disabled="isOperating" @click="emit('restart')">
                  <SvgIcon v-if="restartingContainer" name="loading" :size="14" :spin="true" />
                  <span>{{ restartingContainer ? '重启中...' : '重启' }}</span>
                </button>
              </template>

              <span
                v-else-if="isReadOnly"
                :class="styles['read-only-hint']"
                :title="typeMeta?.description"
              >
                <SvgIcon name="info" :size="14" />
                只读模式
              </span>

              <button :class="[styles['btn'], styles['danger']]" @click="emit('remove')">
                删除
              </button>
            </div>
          </div>

          <div :class="styles['overview-meta']">
            <span class="badge">{{ creationTypeLabel }}</span>
            <span :class="[styles['overview-meta__code']]">ID {{ container.shortId }}</span>
            <span class="badge">创建于 {{ formatCreated(container.created) }}</span>
          </div>
        </div>
      </section>

      <section v-if="stats" :class="styles['detail-section']">
        <div :class="styles['section-title-row']">
          <h3 :class="styles['section-title']">资源监控</h3>
          <button
            :class="styles['btn-refresh']"
            type="button"
            title="刷新资源监控"
            aria-label="刷新资源监控"
            :disabled="refreshingStats"
            @click="emit('refresh-stats')"
          >
            <SvgIcon name="refresh" :size="14" :spin="refreshingStats" />
          </button>
        </div>
        <div :class="styles['stats-grid']">
          <div :class="styles['stat-card']">
            <div :class="styles['stat-label']">CPU 使用率</div>
            <div :class="styles['stat-value']">{{ formattedCpu }}</div>
            <div :class="styles['stat-bar']">
              <div
                :class="[styles['stat-bar-fill'], styles['cpu']]"
                :style="{ width: Math.min(stats.cpu, 100) + '%' }"
              ></div>
            </div>
          </div>
          <div :class="styles['stat-card']">
            <div :class="styles['stat-label']">内存使用</div>
            <div :class="styles['stat-value']">{{ formattedMemory }}</div>
            <div :class="styles['stat-bar']">
              <div
                :class="[styles['stat-bar-fill'], styles['memory']]"
                :style="{ width: Math.min(stats.memory.percent, 100) + '%' }"
              ></div>
            </div>
          </div>
          <div :class="styles['stat-card']">
            <div :class="styles['stat-label']">网络接收</div>
            <div :class="styles['stat-value']">{{ formattedNetwork.rx }}</div>
          </div>
          <div :class="styles['stat-card']">
            <div :class="styles['stat-label']">网络发送</div>
            <div :class="styles['stat-value']">{{ formattedNetwork.tx }}</div>
          </div>
          <div :class="styles['stat-card']">
            <div :class="styles['stat-label']">块设备读取</div>
            <div :class="styles['stat-value']">{{ formattedBlockIO.read }}</div>
          </div>
          <div :class="styles['stat-card']">
            <div :class="styles['stat-label']">块设备写入</div>
            <div :class="styles['stat-value']">{{ formattedBlockIO.write }}</div>
          </div>
        </div>
      </section>

      <section :class="styles['detail-section']">
        <h3 :class="styles['section-title']">基本信息</h3>
        <div :class="styles['info-grid']">
          <div :class="styles['info-item']">
            <span :class="styles['info-label']">容器 ID</span>
            <span :class="[styles['info-value'], styles['info-value--code']]">{{
              container.id
            }}</span>
          </div>
          <div :class="styles['info-item']">
            <span :class="styles['info-label']">短 ID</span>
            <span :class="[styles['info-value'], styles['info-value--code']]">{{
              container.shortId
            }}</span>
          </div>
          <div :class="styles['info-item']">
            <span :class="styles['info-label']">镜像</span>
            <span :class="[styles['info-value'], styles['info-value--code']]">{{
              container.image
            }}</span>
          </div>
          <div :class="styles['info-item']">
            <span :class="styles['info-label']">创建时间</span>
            <span :class="styles['info-value']">{{ formatCreated(container.created) }}</span>
          </div>
          <div :class="styles['info-item']">
            <span :class="styles['info-label']">状态</span>
            <span :class="styles['info-value']">{{ container.status }}</span>
          </div>
          <div :class="styles['info-item']">
            <span :class="styles['info-label']">工作目录</span>
            <span :class="[styles['info-value'], styles['info-value--code']]">{{
              container.workingDir || '-'
            }}</span>
          </div>
          <div :class="styles['info-item']">
            <span :class="styles['info-label']">命令</span>
            <span :class="[styles['info-value'], styles['info-value--code']]">{{
              container.cmd?.join(' ') || '-'
            }}</span>
          </div>
          <div :class="styles['info-item']">
            <span :class="styles['info-label']">入口点</span>
            <span :class="[styles['info-value'], styles['info-value--code']]">
              {{ container.entrypoint?.join(' ') || '-' }}
            </span>
          </div>
        </div>
      </section>

      <section :class="styles['detail-section']">
        <h3 :class="styles['section-title']">端口映射</h3>
        <div v-if="mappedPorts.length > 0" :class="styles['ports-list']">
          <div v-for="(port, index) in mappedPorts" :key="index" :class="styles['port-item']">
            <span :class="styles['port-host']">{{ port.hostPort }}</span>
            <span :class="styles['port-arrow']">-></span>
            <span :class="styles['port-container']"
              >{{ port.containerPort }}/{{ port.protocol }}</span
            >
          </div>
        </div>
        <p v-else :class="styles['empty-text']">无端口映射（容器未暴露到主机）</p>
      </section>

      <section v-if="exposedPorts.length > 0" :class="styles['detail-section']">
        <h3 :class="styles['section-title']">容器暴露端口</h3>
        <div :class="[styles['ports-list'], styles['exposed']]">
          <div v-for="(port, index) in exposedPorts" :key="index" :class="styles['port-item']">
            <span :class="styles['port-container']"
              >{{ port.containerPort }}/{{ port.protocol }}</span
            >
            <span :class="styles['port-hint']">(未映射)</span>
          </div>
        </div>
      </section>

      <section :class="styles['detail-section']">
        <h3 :class="styles['section-title']">挂载点</h3>
        <div v-if="container.mounts && container.mounts.length > 0" :class="styles['mounts-list']">
          <div
            v-for="(mount, index) in container.mounts"
            :key="index"
            :class="styles['mount-item']"
          >
            <span :class="styles['mount-type']">[{{ mount.type }}]</span>
            <span :class="styles['mount-source']">{{ mount.source }}</span>
            <span :class="styles['mount-arrow']">-></span>
            <span :class="styles['mount-destination']">{{ mount.destination }}</span>
            <span :class="styles['mount-mode']">({{ mount.mode }})</span>
          </div>
        </div>
        <p v-else :class="styles['empty-text']">无挂载点</p>
      </section>

      <section :class="styles['detail-section']">
        <h3 :class="styles['section-title']">环境变量（前20个，已过滤敏感信息）</h3>
        <div v-if="container.env && container.env.length > 0" :class="styles['env-list']">
          <code
            v-for="(env, index) in formatEnv(container.env)"
            :key="index"
            :class="styles['env-item']"
          >
            {{ env }}
          </code>
        </div>
        <p v-else :class="styles['empty-text']">无环境变量</p>
      </section>

      <section :class="styles['detail-section']">
        <h3 :class="styles['section-title']">网络配置</h3>
        <div v-if="container.networkSettings?.networks" :class="styles['networks-list']">
          <div
            v-for="(network, name) in container.networkSettings.networks"
            :key="name"
            :class="styles['network-item']"
          >
            <div :class="styles['network-name']">{{ name }}</div>
            <div :class="styles['network-details']">
              <span>IP: {{ network.ipAddress || '-' }}</span>
              <span>网关: {{ network.gateway || '-' }}</span>
              <span>MAC: {{ network.macAddress || '-' }}</span>
            </div>
          </div>
        </div>
        <p v-else :class="styles['empty-text']">无网络配置</p>
      </section>
    </template>
  </div>
</template>
