<script setup lang="ts">
import { computed } from 'vue'
import type { MetricChart } from './sshMonitorTypes'
import {
  collectPoints,
  collectGpuNames,
  calculateRateMax,
  formatPercent,
  formatBytePair,
  formatRate,
  formatAxisLabel
} from './sshMonitorFormatters'
import { useSshStatsPolling } from './useSshStatsPolling'
import { useEchartsManager } from './useEchartsManager'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import styles from './SshServerMonitorPanel.module.css'

const props = defineProps<{
  labId: string
  connected: boolean
  active: boolean
}>()

let disposeChartsOnReset = (): void => {}

const polling = useSshStatsPolling({
  labId: computed(() => props.labId),
  connected: computed(() => props.connected),
  active: computed(() => props.active),
  onReset: () => disposeChartsOnReset()
})

const metricCharts = computed<MetricChart[]>(() => {
  const samples = polling.visibleSamples.value
  const latest = polling.stats.value
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

const echartsManager = useEchartsManager(metricCharts)
disposeChartsOnReset = echartsManager.disposeCharts

const {
  stats,
  selectedRangeHours,
  loading,
  refreshing,
  errorMessage,
  sampledAtLabel,
  rangeLabel,
  rangeOptions,
  setRange,
  loadStats
} = polling
</script>

<template>
  <section :class="styles['ssh-server-monitor-panel']">
    <header :class="styles['ssh-server-monitor-panel__header']">
      <div :class="styles['ssh-server-monitor-panel__copy']">
        <div :class="styles['ssh-server-monitor-panel__headline']">
          <h2>远程资源占用</h2>
          <span class="sm-badge">最近采样 {{ sampledAtLabel }}</span>
          <span class="sm-badge">范围 {{ rangeLabel }}</span>
        </div>
      </div>

      <div :class="styles['ssh-server-monitor-panel__actions']">
        <div :class="styles['ssh-server-monitor-panel__range']" aria-label="统计范围">
          <button
            v-for="option in rangeOptions"
            :key="option.value"
            type="button"
            :class="{ [styles['is-active']]: selectedRangeHours === option.value }"
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

    <div v-if="!connected" :class="styles['ssh-server-monitor-panel__state']">
      <h3>SSH 未连接</h3>
      <p>连接远程服务器后，这里会开始实时显示资源占用。</p>
    </div>

    <div v-else-if="loading" :class="styles['ssh-server-monitor-panel__state']">
      <div :class="styles['ssh-server-monitor-panel__spinner']"></div>
      <p>正在采集服务器资源...</p>
    </div>

    <div v-else-if="errorMessage" :class="styles['ssh-server-monitor-panel__state']">
      <h3>监控数据不可用</h3>
      <p>{{ errorMessage }}</p>
      <button class="sm-button sm-button--secondary sm-button--small" @click="loadStats()">
        重试
      </button>
    </div>

    <div v-else-if="stats" :class="styles['ssh-server-monitor-panel__grid']">
      <article
        v-for="chart in metricCharts"
        :key="chart.key"
        :class="[
          styles['ssh-monitor-chart'],
          styles[`ssh-monitor-chart--${chart.tone}`],
          { [styles['is-muted']]: !chart.supported }
        ]"
      >
        <header :class="styles['ssh-monitor-chart__header']">
          <div :class="styles['ssh-monitor-chart__copy']">
            <span :class="styles['ssh-monitor-chart__label']">
              {{ chart.label }}
              <small v-if="chart.labelSuffix" :class="styles['ssh-monitor-chart__label-suffix']">{{
                chart.labelSuffix
              }}</small>
            </span>
            <div :class="styles['ssh-monitor-chart__value-row']">
              <strong>{{ chart.valueLabel }}</strong>
              <small
                v-if="chart.detailLabel && chart.inlineDetail"
                :class="[
                  styles['ssh-monitor-chart__detail'],
                  styles['ssh-monitor-chart__detail--inline']
                ]"
              >
                {{ chart.detailLabel }}
              </small>
            </div>
            <small v-if="chart.hostDetailLabel" :class="styles['ssh-monitor-chart__host-detail']">
              {{ chart.hostDetailLabel }}
            </small>
            <small
              v-if="chart.detailLabel && !chart.inlineDetail"
              :class="styles['ssh-monitor-chart__detail']"
            >
              {{ chart.detailLabel }}
            </small>
          </div>
          <span :class="styles['ssh-monitor-chart__axis']">{{ formatAxisLabel(chart) }}</span>
        </header>

        <div :class="styles['ssh-monitor-chart__body']">
          <div
            :ref="(element) => echartsManager.setChartElement(chart.key, element)"
            :class="styles['ssh-monitor-chart__echarts']"
            role="img"
            :aria-label="`${chart.label} ${rangeLabel}趋势`"
          ></div>

          <div v-if="chart.points.length === 0" :class="styles['ssh-monitor-chart__empty']">
            {{ chart.emptyLabel }}
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
