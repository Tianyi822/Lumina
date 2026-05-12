import test from 'node:test'
import assert from 'node:assert/strict'
import { SshStatsService } from './SshStatsService'
import type { ExecCommand, ExecResult } from '@shared/types/lab'

class FakeExecutor {
  readonly commands: ExecCommand[] = []

  private readonly results: Array<ExecResult | null>

  constructor(results: Array<ExecResult | null>) {
    this.results = results
  }

  async execCommand(_targetId: string, command: ExecCommand): Promise<ExecResult | null> {
    this.commands.push(command)
    return this.results.shift() ?? null
  }
}

function createExecResult(stdout: string, exitCode = 0): ExecResult {
  return {
    exitCode,
    stdout,
    stderr: '',
    duration: 12
  }
}

function createStatsOutput(options: {
  cpuLine: string
  memTotalKb?: number
  memAvailableKb?: number
  cgroupCurrentBytes?: number | string
  cgroupLimitBytes?: number | string
  cgroupPath?: string
  memoryPath?: string
  readSectors: number
  writeSectors: number
  gpuOutput?: string
}): string {
  return [
    '__PROC_STAT__',
    options.cpuLine,
    '__PROC_MEMINFO__',
    `MemTotal:       ${options.memTotalKb ?? 1000000} kB`,
    `MemAvailable:   ${options.memAvailableKb ?? 250000} kB`,
    '__CGROUP_MEMORY__',
    options.cgroupPath === undefined ? '' : `cgroup_path=${options.cgroupPath}`,
    options.memoryPath === undefined ? '' : `memory_path=${options.memoryPath}`,
    options.cgroupCurrentBytes === undefined ? '' : `current_bytes=${options.cgroupCurrentBytes}`,
    options.cgroupLimitBytes === undefined ? '' : `limit_bytes=${options.cgroupLimitBytes}`,
    '__PROC_DISKSTATS__',
    `   8       0 sda 1 0 ${options.readSectors} 0 1 0 ${options.writeSectors} 0 0 0 0 0 0 0 0`,
    '   7       0 loop0 1 0 999999 0 1 0 999999 0 0 0 0 0 0 0 0',
    '__NVIDIA_SMI__',
    options.gpuOutput ?? '__NO_NVIDIA_SMI__'
  ].join('\n')
}

test('SshStatsService', async (t) => {
  await t.test('未连接时返回错误', async () => {
    const service = new SshStatsService(new FakeExecutor([null]))

    const result = await service.getServerStats('lab-offline')

    assert.equal(result.success, false)
    assert.match(result.error || '', /未连接/)
  })

  await t.test('根据连续采样计算 CPU 和磁盘 IO delta', async () => {
    let now = 1_000
    const service = new SshStatsService(
      new FakeExecutor([
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  100 0 50 850 0 0 0 0 0 0',
            readSectors: 1000,
            writeSectors: 2000
          })
        ),
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  120 0 70 910 0 0 0 0 0 0',
            readSectors: 1100,
            writeSectors: 2600
          })
        )
      ]),
      () => now
    )

    const first = await service.getServerStats('lab-1')
    now = 2_000
    const second = await service.getServerStats('lab-1')

    assert.equal(first.success, true)
    assert.equal(first.stats?.cpu.percent, 0)
    assert.equal(first.stats?.diskIO.readBytesPerSecond, 0)
    assert.equal(second.success, true)
    assert.equal(second.stats?.cpu.percent, 40)
    assert.equal(second.stats?.diskIO.readBytesPerSecond, 100 * 512)
    assert.equal(second.stats?.diskIO.writeBytesPerSecond, 600 * 512)
  })

  await t.test('内存优先使用 cgroup 限额而不是宿主机 /proc/meminfo', async () => {
    const gib = 1024 * 1024 * 1024
    const service = new SshStatsService(
      new FakeExecutor([
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  1 0 1 8 0 0 0 0 0 0',
            memTotalKb: Math.round((754.5 * gib) / 1024),
            memAvailableKb: Math.round((566.7 * gib) / 1024),
            cgroupCurrentBytes: 23 * gib,
            cgroupLimitBytes: 92 * gib,
            cgroupPath: '/docker/9f4c6d',
            readSectors: 0,
            writeSectors: 0
          })
        )
      ])
    )

    const result = await service.getServerStats('lab-cgroup-memory')

    assert.equal(result.success, true)
    assert.equal(result.stats?.memory.usageBytes, 23 * gib)
    assert.equal(result.stats?.memory.totalBytes, 92 * gib)
    assert.equal(result.stats?.memory.availableBytes, 69 * gib)
    assert.equal(result.stats?.memory.percent, 25)
    assert.equal(result.stats?.memory.source, 'quota')
    assert.ok(result.stats?.memory.hostTotalBytes)
    assert.ok(result.stats?.memory.hostUsageBytes)
    assert.ok(result.stats?.memory.hostAvailableBytes)
    assert.ok(typeof result.stats?.memory.hostPercent === 'number')
    assert.equal(result.stats?.memory.quotaUsageBytes, 23 * gib)
    assert.equal(result.stats?.memory.quotaTotalBytes, 92 * gib)
    assert.equal(result.stats?.memory.quotaAvailableBytes, 69 * gib)
    assert.equal(result.stats?.memory.quotaPercent, 25)
  })

  await t.test('内存忽略 SSH 登录会话的 cgroup 限额', async () => {
    const gib = 1024 * 1024 * 1024
    const mib = 1024 * 1024
    const hostTotalBytes = 92 * gib
    const hostAvailableBytes = hostTotalBytes - 512 * mib
    const service = new SshStatsService(
      new FakeExecutor([
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  1 0 1 8 0 0 0 0 0 0',
            memTotalKb: hostTotalBytes / 1024,
            memAvailableKb: hostAvailableBytes / 1024,
            cgroupCurrentBytes: 400 * mib,
            cgroupLimitBytes: 2 * gib,
            cgroupPath: '/user.slice/user-1000.slice/session-7.scope',
            readSectors: 0,
            writeSectors: 0
          })
        )
      ])
    )

    const result = await service.getServerStats('lab-ssh-session-memory')

    assert.equal(result.success, true)
    assert.equal(result.stats?.memory.usageBytes, 512 * mib)
    assert.equal(result.stats?.memory.totalBytes, hostTotalBytes)
    assert.equal(result.stats?.memory.availableBytes, hostAvailableBytes)
    assert.equal(result.stats?.memory.percent, 0.54)
    assert.equal(result.stats?.memory.source, 'host')
    assert.equal(result.stats?.memory.hostUsageBytes, 512 * mib)
    assert.equal(result.stats?.memory.hostTotalBytes, hostTotalBytes)
    assert.equal(result.stats?.memory.hostAvailableBytes, hostAvailableBytes)
    assert.equal(result.stats?.memory.hostPercent, 0.54)
    assert.equal(result.stats?.memory.quotaUsageBytes, undefined)
    assert.equal(result.stats?.memory.quotaTotalBytes, undefined)
    assert.equal(result.stats?.memory.quotaAvailableBytes, undefined)
    assert.equal(result.stats?.memory.quotaPercent, undefined)
  })

  await t.test('内存忽略明显过小且无法归属容器的 cgroup 限额', async () => {
    const gib = 1024 * 1024 * 1024
    const service = new SshStatsService(
      new FakeExecutor([
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  1 0 1 8 0 0 0 0 0 0',
            memTotalKb: (92 * gib) / 1024,
            memAvailableKb: (91 * gib) / 1024,
            cgroupCurrentBytes: 512 * 1024 * 1024,
            cgroupLimitBytes: 2 * gib,
            readSectors: 0,
            writeSectors: 0
          })
        )
      ])
    )

    const result = await service.getServerStats('lab-small-cgroup-memory')

    assert.equal(result.success, true)
    assert.equal(result.stats?.memory.usageBytes, gib)
    assert.equal(result.stats?.memory.totalBytes, 92 * gib)
    assert.equal(result.stats?.memory.availableBytes, 91 * gib)
    assert.equal(result.stats?.memory.percent, 1.09)
    assert.equal(result.stats?.memory.source, 'host')
    assert.equal(result.stats?.memory.hostUsageBytes, gib)
    assert.equal(result.stats?.memory.hostTotalBytes, 92 * gib)
    assert.equal(result.stats?.memory.hostAvailableBytes, 91 * gib)
    assert.equal(result.stats?.memory.hostPercent, 1.09)
    assert.equal(result.stats?.memory.quotaUsageBytes, undefined)
    assert.equal(result.stats?.memory.quotaTotalBytes, undefined)
    assert.equal(result.stats?.memory.quotaAvailableBytes, undefined)
    assert.equal(result.stats?.memory.quotaPercent, undefined)
  })

  await t.test('没有 nvidia-smi 时返回 GPU unsupported', async () => {
    const service = new SshStatsService(
      new FakeExecutor([
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  1 0 1 8 0 0 0 0 0 0',
            readSectors: 0,
            writeSectors: 0,
            gpuOutput: '__NO_NVIDIA_SMI__'
          })
        )
      ])
    )

    const result = await service.getServerStats('lab-no-gpu')

    assert.equal(result.success, true)
    assert.equal(result.stats?.gpu.supported, false)
    assert.equal(result.stats?.gpu.devices.length, 0)
    assert.equal(result.stats?.gpu.message, '显卡未开启')
  })

  await t.test('nvidia-smi 查不到设备时按显卡未开启处理', async () => {
    const service = new SshStatsService(
      new FakeExecutor([
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  1 0 1 8 0 0 0 0 0 0',
            readSectors: 0,
            writeSectors: 0,
            gpuOutput: '__NVIDIA_SMI_ERROR__'
          })
        )
      ])
    )

    const result = await service.getServerStats('lab-gpu-disabled')

    assert.equal(result.success, true)
    assert.equal(result.stats?.gpu.supported, false)
    assert.equal(result.stats?.gpu.message, '显卡未开启')
  })

  await t.test('GPU 采集命令包含 nvidia-smi 常见路径 fallback', async () => {
    const executor = new FakeExecutor([
      createExecResult(
        createStatsOutput({
          cpuLine: 'cpu  1 0 1 8 0 0 0 0 0 0',
          readSectors: 0,
          writeSectors: 0
        })
      )
    ])
    const service = new SshStatsService(executor)

    await service.getServerStats('lab-command')

    const command = executor.commands[0]?.command || ''
    assert.match(command, /command -v nvidia-smi/)
    assert.match(command, /\/usr\/bin\/nvidia-smi/)
    assert.match(command, /\/usr\/local\/bin\/nvidia-smi/)
    assert.match(command, /name,utilization\.gpu,memory\.used,memory\.total/)
    assert.match(command, /cgroup_path/)
    assert.match(command, /limit_path/)
  })

  await t.test('解析 nvidia-smi 输出中的 GPU 名称和 32GB 显存', async () => {
    const service = new SshStatsService(
      new FakeExecutor([
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  1 0 1 8 0 0 0 0 0 0',
            readSectors: 0,
            writeSectors: 0,
            gpuOutput: [
              'NVIDIA GeForce RTX 5090, 50, 1024, 32768',
              'NVIDIA A100, 10, 512, 2048'
            ].join('\n')
          })
        )
      ])
    )

    const result = await service.getServerStats('lab-gpu')

    assert.equal(result.success, true)
    assert.equal(result.stats?.gpu.supported, true)
    assert.equal(result.stats?.gpu.devices.length, 2)
    assert.equal(result.stats?.gpu.devices[0].name, 'NVIDIA GeForce RTX 5090')
    assert.equal(result.stats?.gpu.devices[0].memoryTotalBytes, 32768 * 1024 * 1024)
    assert.equal(result.stats?.gpu.utilizationPercent, 30)
    assert.equal(result.stats?.gpu.memoryUsageBytes, (1024 + 512) * 1024 * 1024)
    assert.equal(result.stats?.gpu.memoryTotalBytes, (32768 + 2048) * 1024 * 1024)
    assert.equal(result.stats?.gpu.memoryPercent, 4.41)
  })

  await t.test('无 cgroup 限额时 source 为 host 且 quota 字段为 undefined', async () => {
    const gib = 1024 * 1024 * 1024
    const hostTotalBytes = 64 * gib
    const hostAvailableBytes = 48 * gib
    const service = new SshStatsService(
      new FakeExecutor([
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  1 0 1 8 0 0 0 0 0 0',
            memTotalKb: hostTotalBytes / 1024,
            memAvailableKb: hostAvailableBytes / 1024,
            readSectors: 0,
            writeSectors: 0
          })
        )
      ])
    )

    const result = await service.getServerStats('lab-no-cgroup')

    assert.equal(result.success, true)
    assert.equal(result.stats?.memory.source, 'host')
    assert.equal(result.stats?.memory.usageBytes, 16 * gib)
    assert.equal(result.stats?.memory.totalBytes, hostTotalBytes)
    assert.equal(result.stats?.memory.availableBytes, hostAvailableBytes)
    assert.equal(result.stats?.memory.percent, 25)
    assert.equal(result.stats?.memory.hostUsageBytes, 16 * gib)
    assert.equal(result.stats?.memory.hostTotalBytes, hostTotalBytes)
    assert.equal(result.stats?.memory.hostAvailableBytes, hostAvailableBytes)
    assert.equal(result.stats?.memory.hostPercent, 25)
    assert.equal(result.stats?.memory.quotaUsageBytes, undefined)
    assert.equal(result.stats?.memory.quotaTotalBytes, undefined)
    assert.equal(result.stats?.memory.quotaAvailableBytes, undefined)
    assert.equal(result.stats?.memory.quotaPercent, undefined)
  })

  await t.test('cgroup 可信但 currentBytes 缺失时回退为宿主机用量的配额上限', async () => {
    const gib = 1024 * 1024 * 1024
    const hostTotalBytes = 128 * gib
    const hostAvailableBytes = 64 * gib
    const quotaTotalBytes = 32 * gib
    const service = new SshStatsService(
      new FakeExecutor([
        createExecResult(
          createStatsOutput({
            cpuLine: 'cpu  1 0 1 8 0 0 0 0 0 0',
            memTotalKb: hostTotalBytes / 1024,
            memAvailableKb: hostAvailableBytes / 1024,
            cgroupLimitBytes: quotaTotalBytes,
            cgroupPath: '/docker/abc123',
            readSectors: 0,
            writeSectors: 0
          })
        )
      ])
    )

    const result = await service.getServerStats('lab-missing-current')

    assert.equal(result.success, true)
    // 宿主机用量 64G，配额 32G → quotaUsage = min(64G, 32G) = 32G
    assert.equal(result.stats?.memory.source, 'quota')
    assert.equal(result.stats?.memory.usageBytes, quotaTotalBytes)
    assert.equal(result.stats?.memory.totalBytes, quotaTotalBytes)
    assert.equal(result.stats?.memory.quotaUsageBytes, quotaTotalBytes)
    assert.equal(result.stats?.memory.quotaTotalBytes, quotaTotalBytes)
  })
})
