import type { CommandExecutor } from '../interfaces/CommandExecutor'
import { SshCommandExecutor } from './SshCommandExecutor'
import type { SshGpuDeviceStats, SshServerStats, SshServerStatsResult } from '@shared/types/lab'

/** CPU 快照（用于计算使用率增量） */
interface CpuSnapshot {
  total: number
  idle: number
}

/** 磁盘 IO 快照（用于计算速率增量） */
interface DiskSnapshot {
  readBytes: number
  writeBytes: number
  timestampMs: number
}

/** 按标记解析后的远程输出分区 */
interface ParsedSections {
  stat: string
  meminfo: string
  cgroupMemory: string
  diskstats: string
  gpu: string
}

/** CGroup 内存统计解析结果 */
interface CgroupMemoryStats {
  currentBytes?: number
  limitBytes?: number
  cgroupPath?: string
  memoryPath?: string
  currentPath?: string
  limitPath?: string
}

const MAX_CGROUP_MEMORY_LIMIT_BYTES = 1_000_000_000_000_000
const MIN_CGROUP_MEMORY_LIMIT_RATIO = 0.05

/** 构造 nvidia-smi 查询命令，兼容多种安装路径 */
const NVIDIA_SMI_COMMAND = [
  'NVIDIA_SMI="$(command -v nvidia-smi 2>/dev/null || true)"',
  'if [ -z "$NVIDIA_SMI" ]; then for candidate in /usr/bin/nvidia-smi /usr/local/bin/nvidia-smi; do if [ -x "$candidate" ]; then NVIDIA_SMI="$candidate"; break; fi; done; fi',
  'if [ -n "$NVIDIA_SMI" ]; then "$NVIDIA_SMI" --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null || printf "__NVIDIA_SMI_ERROR__\\n"; else printf "__NO_NVIDIA_SMI__\\n"; fi'
].join('; ')

/** 构造 CGroup 内存限制查询命令，兼容 v1/v2 两种接口 */
const CGROUP_MEMORY_COMMAND = [
  `CGROUP_PATH="$(awk -F: '$1 == "0" && $2 == "" { print $3 }' /proc/self/cgroup 2>/dev/null | head -n 1)"`,
  `MEMORY_PATH="$(awk -F: '$2 ~ /(^|,)memory(,|$)/ { print $3 }' /proc/self/cgroup 2>/dev/null | head -n 1)"`,
  'printf "cgroup_path=%s\\n" "$CGROUP_PATH"',
  'printf "memory_path=%s\\n" "$MEMORY_PATH"',
  'for file in "/sys/fs/cgroup$CGROUP_PATH/memory.current" /sys/fs/cgroup/memory.current "/sys/fs/cgroup/memory$MEMORY_PATH/memory.usage_in_bytes" /sys/fs/cgroup/memory/memory.usage_in_bytes; do if [ -r "$file" ]; then printf "current_path=%s\\n" "$file"; printf "current_bytes="; cat "$file"; break; fi; done',
  'for file in "/sys/fs/cgroup$CGROUP_PATH/memory.max" /sys/fs/cgroup/memory.max "/sys/fs/cgroup/memory$MEMORY_PATH/memory.limit_in_bytes" /sys/fs/cgroup/memory/memory.limit_in_bytes; do if [ -r "$file" ]; then printf "limit_path=%s\\n" "$file"; printf "limit_bytes="; cat "$file"; break; fi; done'
].join('; ')

/** 完整的一次性远程采集命令，分区域标记输出 */
const SSH_STATS_COMMAND = [
  "printf '__PROC_STAT__\\n'",
  'cat /proc/stat 2>/dev/null',
  "printf '__PROC_MEMINFO__\\n'",
  'cat /proc/meminfo 2>/dev/null',
  "printf '__CGROUP_MEMORY__\\n'",
  CGROUP_MEMORY_COMMAND,
  "printf '__PROC_DISKSTATS__\\n'",
  'cat /proc/diskstats 2>/dev/null',
  "printf '__NVIDIA_SMI__\\n'",
  NVIDIA_SMI_COMMAND
].join('; ')

const BYTES_PER_KIB = 1024
const BYTES_PER_MIB = 1024 * 1024
const DISK_SECTOR_SIZE = 512

/**
 * SSH 远程服务器资源统计服务
 * 通过远程执行 /proc 采集命令获取 CPU、内存、磁盘、GPU 指标
 */
export class SshStatsService {
  private readonly executor: Pick<CommandExecutor, 'execCommand'>
  private readonly now: () => number
  private readonly previousCpuSnapshots = new Map<string, CpuSnapshot>()
  private readonly previousDiskSnapshots = new Map<string, DiskSnapshot>()

  constructor(
    executor: Pick<CommandExecutor, 'execCommand'> = new SshCommandExecutor(),
    now: () => number = () => Date.now()
  ) {
    this.executor = executor
    this.now = now
  }

  /**
   * 采集远程服务器资源统计信息
   * 通过 SSH 执行批处理命令收集 CPU/内存/磁盘/GPU 数据
   * @param labId - 实验室 ID
   * @returns 服务器统计结果
   */
  async getServerStats(labId: string): Promise<SshServerStatsResult> {
    const result = await this.executor.execCommand(labId, {
      command: SSH_STATS_COMMAND,
      timeout: 8
    })

    if (!result) {
      return { success: false, error: 'SSH 连接不存在或未连接' }
    }

    if (result.exitCode !== 0 && !result.stdout.trim()) {
      return { success: false, error: result.stderr || '远程服务器资源统计采集失败' }
    }

    const sections = this.parseSections(result.stdout)
    const cpuSnapshot = this.parseCpuSnapshot(sections.stat)
    const memory = this.parseMemoryStats(sections.meminfo, sections.cgroupMemory)
    const diskSnapshot = this.parseDiskSnapshot(sections.diskstats)

    if (!cpuSnapshot || !memory || !diskSnapshot) {
      return { success: false, error: '远程服务器不支持 /proc 统计信息或输出格式异常' }
    }

    const sampledAtMs = this.now()
    const cpuPercent = this.calculateCpuPercent(labId, cpuSnapshot)
    const diskRates = this.calculateDiskRates(labId, {
      ...diskSnapshot,
      timestampMs: sampledAtMs
    })

    return {
      success: true,
      stats: {
        sampledAt: new Date(sampledAtMs).toISOString(),
        cpu: {
          percent: cpuPercent
        },
        memory,
        gpu: this.parseGpuStats(sections.gpu),
        diskIO: {
          readBytes: diskSnapshot.readBytes,
          writeBytes: diskSnapshot.writeBytes,
          readBytesPerSecond: diskRates.readBytesPerSecond,
          writeBytesPerSecond: diskRates.writeBytesPerSecond
        }
      }
    }
  }

  /**
   * 将带标记的远程命令输出分割为各个数据区
   * 标记如 __PROC_STAT__、__PROC_MEMINFO__ 等分隔各采集模块
   */
  private parseSections(stdout: string): ParsedSections {
    const sections: Record<keyof ParsedSections, string[]> = {
      stat: [],
      meminfo: [],
      cgroupMemory: [],
      diskstats: [],
      gpu: []
    }
    const markerMap: Record<string, keyof ParsedSections> = {
      __PROC_STAT__: 'stat',
      __PROC_MEMINFO__: 'meminfo',
      __CGROUP_MEMORY__: 'cgroupMemory',
      __PROC_DISKSTATS__: 'diskstats',
      __NVIDIA_SMI__: 'gpu'
    }

    let current: keyof ParsedSections | null = null
    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trimEnd()
      const marker = markerMap[line]
      if (marker) {
        current = marker
        continue
      }

      if (current) {
        sections[current].push(line)
      }
    }

    return {
      stat: sections.stat.join('\n'),
      meminfo: sections.meminfo.join('\n'),
      cgroupMemory: sections.cgroupMemory.join('\n'),
      diskstats: sections.diskstats.join('\n'),
      gpu: sections.gpu.join('\n')
    }
  }

  /**
   * 从 /proc/stat 解析 CPU 时间快照（用于后续计算使用率）
   */
  private parseCpuSnapshot(stat: string): CpuSnapshot | null {
    const cpuLine = stat.split(/\r?\n/).find((line) => line.startsWith('cpu '))
    if (!cpuLine) {
      return null
    }

    const values = cpuLine
      .trim()
      .split(/\s+/)
      .slice(1)
      .map((value) => Number(value))

    if (values.length < 4 || values.some((value) => !Number.isFinite(value))) {
      return null
    }

    return {
      total: values.reduce((sum, value) => sum + value, 0),
      idle: values[3] + (values[4] || 0)
    }
  }

  /**
   * 解析内存统计信息
   * 优先检测 CGroup 配额限制，如果容器有独立限制则使用配额统计
   */
  private parseMemoryStats(meminfo: string, cgroupMemory: string): SshServerStats['memory'] | null {
    const entries = new Map<string, number>()
    for (const line of meminfo.split(/\r?\n/)) {
      const match = /^([A-Za-z_()]+):\s+(\d+)\s+kB$/i.exec(line.trim())
      if (match) {
        entries.set(match[1], Number(match[2]) * BYTES_PER_KIB)
      }
    }

    const hostTotalBytes = entries.get('MemTotal')
    const hostAvailableBytes = entries.get('MemAvailable') ?? entries.get('MemFree')
    if (!hostTotalBytes || hostAvailableBytes === undefined) {
      return null
    }

    const hostUsageBytes = Math.max(0, hostTotalBytes - hostAvailableBytes)
    const hostPercent = this.roundPercent((hostUsageBytes / hostTotalBytes) * 100)

    const cgroupStats = this.parseCgroupMemoryStats(cgroupMemory)
    if (this.isUsableCgroupMemoryLimit(cgroupStats, hostTotalBytes)) {
      const quotaTotalBytes = cgroupStats.limitBytes
      const quotaUsageBytes =
        cgroupStats.currentBytes === undefined
          ? Math.min(hostUsageBytes, quotaTotalBytes)
          : Math.min(cgroupStats.currentBytes, quotaTotalBytes)
      const quotaAvailableBytes = Math.max(0, quotaTotalBytes - quotaUsageBytes)
      const quotaPercent = this.roundPercent((quotaUsageBytes / quotaTotalBytes) * 100)

      return {
        usageBytes: quotaUsageBytes,
        totalBytes: quotaTotalBytes,
        availableBytes: quotaAvailableBytes,
        percent: quotaPercent,
        source: 'quota',
        hostUsageBytes,
        hostTotalBytes,
        hostAvailableBytes,
        hostPercent,
        quotaUsageBytes,
        quotaTotalBytes,
        quotaAvailableBytes,
        quotaPercent
      }
    }

    return {
      usageBytes: hostUsageBytes,
      totalBytes: hostTotalBytes,
      availableBytes: hostAvailableBytes,
      percent: hostPercent,
      source: 'host',
      hostUsageBytes,
      hostTotalBytes,
      hostAvailableBytes,
      hostPercent
    }
  }

  /**
   * 解析 CGroup 内存统计输出
   */
  private parseCgroupMemoryStats(cgroupMemory: string): CgroupMemoryStats {
    const stats: CgroupMemoryStats = {}

    for (const line of cgroupMemory.split(/\r?\n/)) {
      const [key, rawValue] = line
        .trim()
        .split('=')
        .map((part) => part.trim())

      if (!key || !rawValue || rawValue === 'max') {
        continue
      }

      if (key === 'cgroup_path') {
        stats.cgroupPath = rawValue
        continue
      }

      if (key === 'memory_path') {
        stats.memoryPath = rawValue
        continue
      }

      if (key === 'current_path') {
        stats.currentPath = rawValue
        continue
      }

      if (key === 'limit_path') {
        stats.limitPath = rawValue
        continue
      }

      const value = Number(rawValue)
      if (!Number.isFinite(value) || value <= 0) {
        continue
      }

      if (key === 'current_bytes') {
        stats.currentBytes = value
      } else if (key === 'limit_bytes') {
        stats.limitBytes = value
      }
    }

    return stats
  }

  /**
   * 判断 CGroup 内存限制是否可信且可用
   * 排除宿主机全量限制、用户会话 cgroup、检测容器 cgroup
   */
  private isUsableCgroupMemoryLimit(
    cgroupStats: CgroupMemoryStats,
    hostTotalBytes: number
  ): cgroupStats is CgroupMemoryStats & { limitBytes: number } {
    const limitBytes = cgroupStats.limitBytes
    if (
      !limitBytes ||
      limitBytes <= 0 ||
      limitBytes >= hostTotalBytes ||
      limitBytes >= MAX_CGROUP_MEMORY_LIMIT_BYTES
    ) {
      return false
    }

    if (this.isLoginSessionCgroup(cgroupStats)) {
      return false
    }

    if (this.isContainerCgroup(cgroupStats)) {
      return true
    }

    return limitBytes / hostTotalBytes >= MIN_CGROUP_MEMORY_LIMIT_RATIO
  }

  /**
   * 检测是否为用户登录会话的 cgroup（排除此类限制）
   */
  private isLoginSessionCgroup(cgroupStats: CgroupMemoryStats): boolean {
    return this.getCgroupPaths(cgroupStats).some((path) => {
      const normalized = path.toLowerCase()
      return (
        normalized.includes('user.slice') ||
        normalized.includes('session-') ||
        normalized.includes('sshd')
      )
    })
  }

  /**
   * 检测是否为容器 cgroup（docker/containerd/k8s/podman/lxc）
   */
  private isContainerCgroup(cgroupStats: CgroupMemoryStats): boolean {
    return this.getCgroupPaths(cgroupStats).some((path) =>
      /(?:docker|containerd|kubepods|libpod|podman|lxc)/i.test(path)
    )
  }

  private getCgroupPaths(cgroupStats: CgroupMemoryStats): string[] {
    return [
      cgroupStats.cgroupPath,
      cgroupStats.memoryPath,
      cgroupStats.currentPath,
      cgroupStats.limitPath
    ].filter((path): path is string => !!path)
  }

  /**
   * 从 /proc/diskstats 解析磁盘读写字节数
   * 只统计物理整盘（排除分区、loop、ram 等虚拟设备）
   */
  private parseDiskSnapshot(diskstats: string): Omit<DiskSnapshot, 'timestampMs'> | null {
    let readBytes = 0
    let writeBytes = 0
    let hasDevice = false

    for (const line of diskstats.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 10 || !this.isWholeDiskDevice(parts[2])) {
        continue
      }

      const readSectors = Number(parts[5])
      const writtenSectors = Number(parts[9])
      if (!Number.isFinite(readSectors) || !Number.isFinite(writtenSectors)) {
        continue
      }

      hasDevice = true
      readBytes += readSectors * DISK_SECTOR_SIZE
      writeBytes += writtenSectors * DISK_SECTOR_SIZE
    }

    return hasDevice ? { readBytes, writeBytes } : null
  }

  /**
   * 解析 nvidia-smi 输出为 GPU 统计
   */
  private parseGpuStats(gpuOutput: string): SshServerStats['gpu'] {
    const lines = gpuOutput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    const hasNoGpu = lines.length === 0 || lines.includes('__NO_NVIDIA_SMI__')
    const hasQueryError = lines.includes('__NVIDIA_SMI_ERROR__')

    if (hasNoGpu || hasQueryError) {
      return {
        supported: false,
        utilizationPercent: null,
        memoryUsageBytes: null,
        memoryTotalBytes: null,
        memoryPercent: null,
        devices: [],
        message: '显卡未开启'
      }
    }

    const devices: SshGpuDeviceStats[] = []
    for (const [index, line] of lines.entries()) {
      const fields = line.split(',').map((part) => part.trim())
      if (fields.length < 4) {
        continue
      }

      const name = fields.slice(0, -3).join(', ').trim()
      const utilizationRaw = fields[fields.length - 3]
      const memoryUsageRaw = fields[fields.length - 2]
      const memoryTotalRaw = fields[fields.length - 1]

      const utilizationPercent = this.parseNullableNumber(utilizationRaw)
      const memoryUsageMib = this.parseNullableNumber(memoryUsageRaw)
      const memoryTotalMib = this.parseNullableNumber(memoryTotalRaw)
      const memoryUsageBytes = memoryUsageMib === null ? null : memoryUsageMib * BYTES_PER_MIB
      const memoryTotalBytes = memoryTotalMib === null ? null : memoryTotalMib * BYTES_PER_MIB

      devices.push({
        index,
        name: name || undefined,
        utilizationPercent,
        memoryUsageBytes,
        memoryTotalBytes,
        memoryPercent:
          memoryUsageBytes !== null && memoryTotalBytes
            ? this.roundPercent((memoryUsageBytes / memoryTotalBytes) * 100)
            : null
      })
    }

    const utilizationValues = devices
      .map((device) => device.utilizationPercent)
      .filter((value): value is number => value !== null)
    const memoryUsageBytes = this.sumNullable(devices.map((device) => device.memoryUsageBytes))
    const memoryTotalBytes = this.sumNullable(devices.map((device) => device.memoryTotalBytes))

    return {
      supported: devices.length > 0,
      utilizationPercent:
        utilizationValues.length > 0
          ? this.roundPercent(
              utilizationValues.reduce((sum, value) => sum + value, 0) / utilizationValues.length
            )
          : null,
      memoryUsageBytes,
      memoryTotalBytes,
      memoryPercent:
        memoryUsageBytes !== null && memoryTotalBytes
          ? this.roundPercent((memoryUsageBytes / memoryTotalBytes) * 100)
          : null,
      devices,
      message: devices.length > 0 ? undefined : '显卡未开启'
    }
  }

  /**
   * 根据两次 CPU 快照计算 CPU 使用率
   * 首次快照返回 0，后续通过时间差计算增量
   */
  private calculateCpuPercent(labId: string, current: CpuSnapshot): number {
    const previous = this.previousCpuSnapshots.get(labId)
    this.previousCpuSnapshots.set(labId, current)

    if (!previous) {
      return 0
    }

    const totalDelta = current.total - previous.total
    const idleDelta = current.idle - previous.idle
    if (totalDelta <= 0) {
      return 0
    }

    return this.roundPercent(((totalDelta - idleDelta) / totalDelta) * 100)
  }

  /**
   * 根据两次磁盘快照计算磁盘读写速率（字节/秒）
   */
  private calculateDiskRates(
    labId: string,
    current: DiskSnapshot
  ): { readBytesPerSecond: number; writeBytesPerSecond: number } {
    const previous = this.previousDiskSnapshots.get(labId)
    this.previousDiskSnapshots.set(labId, current)

    if (!previous) {
      return { readBytesPerSecond: 0, writeBytesPerSecond: 0 }
    }

    const elapsedSeconds = (current.timestampMs - previous.timestampMs) / 1000
    if (elapsedSeconds <= 0) {
      return { readBytesPerSecond: 0, writeBytesPerSecond: 0 }
    }

    return {
      readBytesPerSecond: Math.max(
        0,
        Math.round((current.readBytes - previous.readBytes) / elapsedSeconds)
      ),
      writeBytesPerSecond: Math.max(
        0,
        Math.round((current.writeBytes - previous.writeBytes) / elapsedSeconds)
      )
    }
  }

  /**
   * 判断是否为物理整盘设备名
   * 过滤掉分区、loop、ram、fd、sr、dm 等虚拟设备
   */
  private isWholeDiskDevice(name: string): boolean {
    if (/^(loop|ram|fd|sr)\d+/.test(name) || /^dm-\d+$/.test(name)) {
      return false
    }

    if (/^nvme\d+n\d+p\d+$/.test(name) || /^mmcblk\d+p\d+$/.test(name)) {
      return false
    }

    return !/^[a-z]+[0-9]+$/.test(name)
  }

  /**
   * 解析可能为 N/A 的数字字符串
   */
  private parseNullableNumber(value?: string): number | null {
    if (!value || value.toUpperCase() === 'N/A') {
      return null
    }

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  /**
   * 对可空数字数组求和，全部为 null 返回 null
   */
  private sumNullable(values: Array<number | null>): number | null {
    const finiteValues = values.filter((value): value is number => value !== null)
    if (finiteValues.length === 0) {
      return null
    }

    return finiteValues.reduce((sum, value) => sum + value, 0)
  }

  /**
   * 将百分比保留两位小数
   */
  private roundPercent(value: number): number {
    return Math.round(value * 100) / 100
  }
}

export const sshStatsService = new SshStatsService()
