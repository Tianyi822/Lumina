<script setup lang="ts">
import * as echarts from 'echarts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import type { SshServerStats } from '@renderer/types/lab'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const SSH_STATS_REFRESH_INTERVAL = 3000
const MAX_HISTORY_HOURS = 24

type RangeHours = 1 | 3 | 12 | 24
type ChartValueKind = 'percent' | 'rate'
type ChartTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

interface ChartPoint {
  time: number
  value: number
}

interface MetricChart {
  key: string
  label: string
  valueLabel: string
  detailLabel?: string
  inlineDetail?: boolean
  tone: ChartTone
  kind: ChartValueKind
  maxValue: number
  points: ChartPoint[]
  emptyLabel: string
  supported: boolean
  hostDetailLabel?: string
  labelSuffix?: string
}

const props = defineProps<{
  labId: string
  connected: boolean
  active: boolean
}>()

const rangeOptions: Array<{ label: string; value: RangeHours }> = [
  { label: '1 小时', value: 1 },
  { label: '3 小时', value: 3 },
  { label: '12 小时', value: 12 },
  { label: '24 小时', value: 24 }
]

const stats = ref<SshServerStats | null>(null)
const statsHistory = ref<SshServerStats[]>([])
const selectedRangeHours = ref<RangeHours>(1)
const loading = ref(false)
const refreshing = ref(false)
const errorMessage = ref('')
const refreshTimerId = ref<number | null>(null)

const chartElements = new Map<string, HTMLElement>()
const chartInstances = new Map<string, ECharts>()
let resizeObserver: ResizeObserver | null = null
let renderQueued = false

const sampledAtLabel = computed(() => {
  if (!stats.value?.sampledAt) {
    return '-'
  }

  return new Date(stats.value.sampledAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
})

const chartWindow = computed(() => {
  const end = Math.max(Date.now(), stats.value ? new Date(stats.value.sampledAt).getTime() : 0)
  return {
    start: end - selectedRangeHours.value * 60 * 60 * 1000,
    end
  }
})

const visibleSamples = computed(() => {
  const { start, end } = chartWindow.value
  return statsHistory.value.filter((sample) => {
    const time = new Date(sample.sampledAt).getTime()
    return time >= start && time <= end
  })
})

const metricCharts = computed<MetricChart[]>(() => {
  const samples = visibleSamples.value
  const latest = stats.value
  const gpuSupported = !!latest?.gpu.supported
  const hasGpuMemory = gpuSupported && latest?.gpu.memoryPercent !== null
  const gpuNames = collectGpuNames(latest)

  return [
    {
      key: 'cpu',
      label: 'CPU 占用',
      valueLabel: formatPercent(latest?.cpu.percent),
      tone: 'primary',
      kind: 'percent',
      maxValue: 100,
      supported: true,
      emptyLabel: '等待 CPU 采样',
      points: collectPoints(samples, (sample) => sample.cpu.percent)
    },
    {
      key: 'memory',
      label: '内存占用',
      valueLabel: latest
        ? `${latest.memory.source === 'quota' ? '实例配额 ' : '宿主机 '}${formatBytePair(latest.memory.usageBytes, latest.memory.totalBytes)}`
        : '-',
      detailLabel: formatPercent(latest?.memory.percent),
      inlineDetail: true,
      tone: 'success',
      kind: 'percent',
      maxValue: 100,
      supported: true,
      emptyLabel: '等待内存采样',
      points: collectPoints(samples, (sample) => sample.memory.percent)
    },
    {
      key: 'gpu',
      label: 'GPU 占用',
      valueLabel: gpuSupported
        ? formatPercent(latest?.gpu.utilizationPercent)
        : latest?.gpu.message || '显卡未开启',
      labelSuffix: gpuSupported && gpuNames.length > 0 ? gpuNames.join(' / ') : undefined,
      tone: gpuSupported ? 'warning' : 'muted',
      kind: 'percent',
      maxValue: 100,
      supported: gpuSupported,
      emptyLabel: '显卡未开启',
      points: collectPoints(samples, (sample) => sample.gpu.utilizationPercent)
    },
    {
      key: 'vram',
      label: '显存占用',
      valueLabel:
        latest && latest.gpu.memoryUsageBytes !== null && latest.gpu.memoryTotalBytes !== null
          ? formatBytePair(latest.gpu.memoryUsageBytes, latest.gpu.memoryTotalBytes)
          : '显存不可用',
      detailLabel: hasGpuMemory ? formatPercent(latest?.gpu.memoryPercent) : undefined,
      inlineDetail: true,
      tone: hasGpuMemory ? 'danger' : 'muted',
      kind: 'percent',
      maxValue: 100,
      supported: hasGpuMemory,
      emptyLabel: '显存不可用',
      points: collectPoints(samples, (sample) => sample.gpu.memoryPercent)
    },
    {
      key: 'disk-read',
      label: '磁盘读取',
      valueLabel: formatRate(latest?.diskIO.readBytesPerSecond),
      tone: 'info',
      kind: 'rate',
      maxValue: calculateRateMax(samples, (sample) => sample.diskIO.readBytesPerSecond),
      supported: true,
      emptyLabel: '等待磁盘读取采样',
      points: collectPoints(samples, (sample) => sample.diskIO.readBytesPerSecond)
    },
    {
      key: 'disk-write',
      label: '磁盘写入',
      valueLabel: formatRate(latest?.diskIO.writeBytesPerSecond),
      tone: 'info',
      kind: 'rate',
      maxValue: calculateRateMax(samples, (sample) => sample.diskIO.writeBytesPerSecond),
      supported: true,
      emptyLabel: '等待磁盘写入采样',
      points: collectPoints(samples, (sample) => sample.diskIO.writeBytesPerSecond)
    }
  ]
})

const rangeLabel = computed(() => {
  return rangeOptions.find((option) => option.value === selectedRangeHours.value)?.label || '1 小时'
})

watch(
  () => props.labId,
  () => {
    stats.value = null
    statsHistory.value = []
    errorMessage.value = ''
    disposeCharts()
  }
)

watch(
  () => [props.labId, props.connected, props.active] as const,
  () => {
    syncPolling()
  },
  { immediate: true }
)

watch(metricCharts, () => {
  queueRenderCharts()
})

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    resizeCharts()
  })
  chartElements.forEach((element) => resizeObserver?.observe(element))
  queueRenderCharts()
})

onBeforeUnmount(() => {
  stopPolling()
  resizeObserver?.disconnect()
  resizeObserver = null
  disposeCharts()
})

function syncPolling(): void {
  stopPolling()

  if (!props.connected) {
    stats.value = null
    statsHistory.value = []
    errorMessage.value = ''
    loading.value = false
    refreshing.value = false
    disposeCharts()
    return
  }

  if (!props.active) {
    return
  }

  void loadStats({ silent: !!stats.value })
  refreshTimerId.value = window.setInterval(() => {
    void loadStats({ silent: true })
  }, SSH_STATS_REFRESH_INTERVAL)
}

function stopPolling(): void {
  if (refreshTimerId.value !== null) {
    clearInterval(refreshTimerId.value)
    refreshTimerId.value = null
  }
}

async function loadStats(options?: { silent?: boolean }): Promise<void> {
  if (!props.connected || refreshing.value) {
    return
  }

  refreshing.value = true
  if (!options?.silent && !stats.value) {
    loading.value = true
  }

  try {
    const result = await window.api.ssh.getServerStats(props.labId)
    if (!result.success || !result.stats) {
      errorMessage.value = result.error || '服务器资源统计采集失败'
      return
    }

    stats.value = result.stats
    appendSample(result.stats)
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    refreshing.value = false
    loading.value = false
  }
}

function appendSample(sample: SshServerStats): void {
  const sampleTime = new Date(sample.sampledAt).getTime()
  const minTime = sampleTime - MAX_HISTORY_HOURS * 60 * 60 * 1000

  statsHistory.value = [
    ...statsHistory.value.filter((item) => new Date(item.sampledAt).getTime() >= minTime),
    sample
  ]
}

function setRange(hours: RangeHours): void {
  selectedRangeHours.value = hours
}

function setChartElement(key: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement = resolveHtmlElement(element)
  const previousElement = chartElements.get(key)

  if (!htmlElement) {
    if (previousElement) {
      resizeObserver?.unobserve(previousElement)
    }
    chartElements.delete(key)
    const instance = chartInstances.get(key)
    if (instance) {
      instance.dispose()
      chartInstances.delete(key)
    }
    return
  }

  if (previousElement && previousElement !== htmlElement) {
    resizeObserver?.unobserve(previousElement)
  }

  chartElements.set(key, htmlElement)
  resizeObserver?.observe(htmlElement)

  if (!chartInstances.has(key)) {
    chartInstances.set(key, echarts.init(htmlElement, undefined, { renderer: 'canvas' }))
  }

  queueRenderCharts()
}

function resolveHtmlElement(element: Element | ComponentPublicInstance | null): HTMLElement | null {
  if (element instanceof HTMLElement) {
    return element
  }

  if (isComponentInstance(element) && element.$el instanceof HTMLElement) {
    return element.$el
  }

  return null
}

function isComponentInstance(
  element: Element | ComponentPublicInstance | null
): element is ComponentPublicInstance {
  return !!element && !(element instanceof Element)
}

function queueRenderCharts(): void {
  if (renderQueued) {
    return
  }

  renderQueued = true
  void nextTick(() => {
    renderQueued = false
    renderCharts()
  })
}

function renderCharts(): void {
  const charts = metricCharts.value
  const activeKeys = new Set(charts.map((chart) => chart.key))

  for (const [key, instance] of chartInstances) {
    if (!activeKeys.has(key) || !chartElements.has(key)) {
      instance.dispose()
      chartInstances.delete(key)
    }
  }

  for (const chart of charts) {
    const element = chartElements.get(chart.key)
    if (!element) {
      continue
    }

    const instance =
      chartInstances.get(chart.key) ?? echarts.init(element, undefined, { renderer: 'canvas' })
    chartInstances.set(chart.key, instance)
    instance.setOption(buildChartOption(chart), true)
  }
}

function disposeCharts(): void {
  for (const instance of chartInstances.values()) {
    instance.dispose()
  }
  chartInstances.clear()
  chartElements.clear()
}

function resizeCharts(): void {
  for (const instance of chartInstances.values()) {
    instance.resize()
  }
}

function buildChartOption(chart: MetricChart): EChartsOption {
  const color = getToneColor(chart.tone)
  const axisColor = readCssVariable('--sm-color-text-tertiary', '#8b949e')
  const gridColor = readCssVariable('--sm-color-border-subtle', '#e5e7eb')
  const labelData = chart.points.map((point) => formatSampleTime(point.time))
  const valueData = chart.points.map((point) => point.value)

  return {
    animation: chart.points.length <= 80,
    grid: {
      left: 8,
      right: 8,
      top: 14,
      bottom: 24,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: (params: unknown) => formatTooltip(params, chart)
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labelData,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: axisColor,
        fontSize: 10,
        hideOverlap: true,
        interval: calculateAxisInterval(chart.points.length)
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: chart.kind === 'percent' ? 100 : Math.max(chart.maxValue, 1),
      splitNumber: 3,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          color: gridColor,
          opacity: 0.72
        }
      }
    },
    series: [
      {
        type: 'line',
        data: valueData,
        smooth: true,
        showSymbol: chart.points.length <= 24,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          width: 2.2,
          color
        },
        itemStyle: {
          color
        },
        areaStyle: {
          color,
          opacity: 0.1
        },
        emphasis: {
          focus: 'series'
        }
      }
    ]
  }
}

function collectPoints(
  samples: SshServerStats[],
  getValue: (sample: SshServerStats) => number | null | undefined
): ChartPoint[] {
  return samples
    .map((sample) => ({
      time: new Date(sample.sampledAt).getTime(),
      value: getValue(sample)
    }))
    .filter(
      (point): point is ChartPoint =>
        point.value !== null && point.value !== undefined && Number.isFinite(point.value)
    )
}

function collectGpuNames(sample: SshServerStats | null): string[] {
  if (!sample?.gpu.supported) {
    return []
  }

  return sample.gpu.devices
    .map((device) => device.name?.trim())
    .filter((name): name is string => !!name)
}

function calculateRateMax(
  samples: SshServerStats[],
  getValue: (sample: SshServerStats) => number | null | undefined
): number {
  const maxValue = Math.max(0, ...collectPoints(samples, getValue).map((point) => point.value))
  return maxValue > 0 ? maxValue * 1.2 : 1
}

function calculateAxisInterval(pointCount: number): number {
  if (pointCount <= 6) {
    return 0
  }

  return Math.max(0, Math.ceil(pointCount / 5) - 1)
}

function formatAxisLabel(chart: MetricChart): string {
  if (chart.kind === 'percent') {
    return '0-100%'
  }

  return `0-${formatRate(chart.maxValue)}`
}

function formatTooltip(params: unknown, chart: MetricChart): string {
  const param = Array.isArray(params) ? params[0] : params
  if (!isRecord(param)) {
    return ''
  }

  const dataIndex = typeof param.dataIndex === 'number' ? param.dataIndex : -1
  const value = normalizeNumericValue(param.value)
  const point = chart.points[dataIndex]
  const timeLabel = point ? formatFullSampleTime(point.time) : String(param.name || '')
  const valueLabel = chart.kind === 'rate' ? formatRate(value) : formatPercent(value)
  const marker = typeof param.marker === 'string' ? param.marker : ''

  return `${timeLabel}<br />${marker}${chart.label}: ${valueLabel}`
}

function normalizeNumericValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (Array.isArray(value)) {
    return normalizeNumericValue(value[value.length - 1])
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatSampleTime(time: number): string {
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatFullSampleTime(time: number): string {
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-'
  }

  return `${value.toFixed(1)}%`
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) {
    return '-'
  }

  if (bytes === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatBytePair(usageBytes: number, totalBytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index =
    totalBytes > 0
      ? Math.min(units.length - 1, Math.floor(Math.log(totalBytes) / Math.log(1024)))
      : 0
  const divisor = Math.pow(1024, index)
  const fractionDigits = index === 0 ? 0 : 1

  return `${(usageBytes / divisor).toFixed(fractionDigits)} / ${(totalBytes / divisor).toFixed(
    fractionDigits
  )} ${units[index]}`
}

function formatRate(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond === null || bytesPerSecond === undefined) {
    return '-'
  }

  return `${formatBytes(bytesPerSecond)}/s`
}

function getToneColor(tone: ChartTone): string {
  const tokenMap: Record<ChartTone, { token: string; fallback: string }> = {
    primary: { token: '--sm-color-accent', fallback: '#2563eb' },
    success: { token: '--sm-color-status-success', fallback: '#16a34a' },
    warning: { token: '--sm-color-status-warning', fallback: '#d97706' },
    danger: { token: '--sm-color-status-danger', fallback: '#dc2626' },
    info: { token: '--sm-color-accent-hover', fallback: '#0891b2' },
    muted: { token: '--sm-color-text-tertiary', fallback: '#94a3b8' }
  }
  const config = tokenMap[tone]
  return readCssVariable(config.token, config.fallback)
}

function readCssVariable(token: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value || fallback
}
</script>

<template>
  <section class="ssh-server-monitor-panel">
    <header class="ssh-server-monitor-panel__header">
      <div class="ssh-server-monitor-panel__copy">
        <div class="ssh-server-monitor-panel__headline">
          <h2>远程资源占用</h2>
          <span class="sm-badge">最近采样 {{ sampledAtLabel }}</span>
          <span class="sm-badge">范围 {{ rangeLabel }}</span>
        </div>
      </div>

      <div class="ssh-server-monitor-panel__actions">
        <div class="ssh-server-monitor-panel__range" aria-label="统计范围">
          <button
            v-for="option in rangeOptions"
            :key="option.value"
            type="button"
            :class="{ 'is-active': selectedRangeHours === option.value }"
            @click="setRange(option.value)"
          >
            {{ option.label }}
          </button>
        </div>

        <button
          class="sm-button sm-button--secondary sm-button--small"
          type="button"
          :disabled="!connected || refreshing"
          @click="loadStats()"
        >
          <SvgIcon name="refresh" :size="14" :spin="refreshing" />
          <span>刷新</span>
        </button>
      </div>
    </header>

    <div v-if="!connected" class="ssh-server-monitor-panel__state">
      <h3>SSH 未连接</h3>
      <p>连接远程服务器后，这里会开始实时显示资源占用。</p>
    </div>

    <div v-else-if="loading" class="ssh-server-monitor-panel__state">
      <div class="ssh-server-monitor-panel__spinner"></div>
      <p>正在采集服务器资源...</p>
    </div>

    <div v-else-if="errorMessage" class="ssh-server-monitor-panel__state">
      <h3>监控数据不可用</h3>
      <p>{{ errorMessage }}</p>
      <button class="sm-button sm-button--secondary sm-button--small" @click="loadStats()">
        重试
      </button>
    </div>

    <div v-else-if="stats" class="ssh-server-monitor-panel__grid">
      <article
        v-for="chart in metricCharts"
        :key="chart.key"
        class="ssh-monitor-chart"
        :class="[`ssh-monitor-chart--${chart.tone}`, { 'is-muted': !chart.supported }]"
      >
        <header class="ssh-monitor-chart__header">
          <div class="ssh-monitor-chart__copy">
            <span class="ssh-monitor-chart__label">
              {{ chart.label }}
              <small v-if="chart.labelSuffix" class="ssh-monitor-chart__label-suffix">{{
                chart.labelSuffix
              }}</small>
            </span>
            <div class="ssh-monitor-chart__value-row">
              <strong>{{ chart.valueLabel }}</strong>
              <small
                v-if="chart.detailLabel && chart.inlineDetail"
                class="ssh-monitor-chart__detail ssh-monitor-chart__detail--inline"
              >
                {{ chart.detailLabel }}
              </small>
            </div>
            <small v-if="chart.hostDetailLabel" class="ssh-monitor-chart__host-detail">
              {{ chart.hostDetailLabel }}
            </small>
            <small
              v-if="chart.detailLabel && !chart.inlineDetail"
              class="ssh-monitor-chart__detail"
            >
              {{ chart.detailLabel }}
            </small>
          </div>
          <span class="ssh-monitor-chart__axis">{{ formatAxisLabel(chart) }}</span>
        </header>

        <div class="ssh-monitor-chart__body">
          <div
            :ref="(element) => setChartElement(chart.key, element)"
            class="ssh-monitor-chart__echarts"
            role="img"
            :aria-label="`${chart.label} ${rangeLabel}趋势`"
          ></div>

          <div v-if="chart.points.length === 0" class="ssh-monitor-chart__empty">
            {{ chart.emptyLabel }}
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.ssh-server-monitor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-2);
}

.ssh-server-monitor-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: var(--sm-space-5);
  border-bottom: 1px solid var(--sm-color-border-subtle);
}

.ssh-server-monitor-panel__copy {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
  min-width: 0;
}

.ssh-server-monitor-panel__headline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
}

.ssh-server-monitor-panel__headline h2 {
  margin: 0;
  color: var(--sm-color-text-primary);
  font-size: 18px;
  line-height: 1.25;
}

.ssh-server-monitor-panel__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--sm-space-3);
}

.ssh-server-monitor-panel__range {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-bg-embedded);
}

.ssh-server-monitor-panel__range button {
  min-height: 28px;
  padding: 0 var(--sm-space-3);
  border: 1px solid transparent;
  border-radius: var(--sm-radius-sm);
  background: transparent;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.ssh-server-monitor-panel__range button:hover {
  border-color: var(--sm-color-border-subtle);
  background: var(--sm-color-surface-hover);
  color: var(--sm-color-text-primary);
}

.ssh-server-monitor-panel__range button.is-active {
  border-color: var(--sm-color-border-selected);
  background: var(--sm-color-surface-selected);
  color: var(--sm-color-text-selected);
}

.ssh-server-monitor-panel__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sm-space-4);
  overflow-y: auto;
  padding: var(--sm-space-5);
}

.ssh-monitor-chart {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  min-height: 230px;
  padding: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-bg-embedded);
}

.ssh-monitor-chart__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-3);
  min-width: 0;
}

.ssh-monitor-chart__copy {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.ssh-monitor-chart__label-suffix {
  color: var(--sm-color-text-tertiary);
  font-size: 11px;
  font-weight: 400;
  margin-left: 6px;
}

.ssh-monitor-chart__label,
.ssh-monitor-chart__axis {
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.ssh-monitor-chart__axis {
  flex-shrink: 0;
  font-family: var(--sm-font-mono);
}

.ssh-monitor-chart__value-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.ssh-monitor-chart strong {
  max-width: 100%;
  color: var(--sm-color-text-primary);
  font-size: 21px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.ssh-monitor-chart__detail {
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.ssh-monitor-chart__detail--inline {
  flex-shrink: 0;
  color: var(--sm-color-text-secondary);
  font-weight: 500;
}

.ssh-monitor-chart__host-detail {
  color: var(--sm-color-text-tertiary);
  font-size: 11px;
  margin-top: 2px;
  overflow-wrap: anywhere;
}

.ssh-monitor-chart__body {
  position: relative;
  flex: 1;
  min-height: 142px;
  overflow: hidden;
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-sm);
  background: color-mix(in srgb, var(--sm-color-surface-1) 72%, transparent);
}

.ssh-monitor-chart__echarts {
  width: 100%;
  height: 100%;
  min-height: 142px;
}

.ssh-monitor-chart--success {
  border-color: color-mix(
    in srgb,
    var(--sm-color-status-success) 22%,
    var(--sm-color-border-subtle)
  );
}

.ssh-monitor-chart--warning {
  border-color: color-mix(
    in srgb,
    var(--sm-color-status-warning) 22%,
    var(--sm-color-border-subtle)
  );
}

.ssh-monitor-chart--danger {
  border-color: color-mix(
    in srgb,
    var(--sm-color-status-danger) 22%,
    var(--sm-color-border-subtle)
  );
}

.ssh-monitor-chart--info {
  border-color: color-mix(in srgb, var(--sm-color-accent-hover) 18%, var(--sm-color-border-subtle));
}

.ssh-monitor-chart.is-muted {
  opacity: 0.72;
}

.ssh-monitor-chart__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sm-space-4);
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  text-align: center;
  pointer-events: none;
}

.ssh-server-monitor-panel__state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: var(--sm-space-3);
  padding: var(--sm-space-6);
  text-align: center;
}

.ssh-server-monitor-panel__state h3,
.ssh-server-monitor-panel__state p {
  margin: 0;
}

.ssh-server-monitor-panel__state h3 {
  color: var(--sm-color-text-primary);
  font-size: 17px;
}

.ssh-server-monitor-panel__state p {
  max-width: 420px;
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.ssh-server-monitor-panel__spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--sm-color-border-default);
  border-top-color: var(--sm-color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .ssh-server-monitor-panel__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .ssh-server-monitor-panel__header,
  .ssh-server-monitor-panel__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .ssh-server-monitor-panel__range {
    overflow-x: auto;
  }
}
</style>
