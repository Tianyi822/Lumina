import Docker from 'dockerode'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@main/services/logger'
import type {
  ContainerInfo,
  ContainerDetails,
  ContainerStats,
  ContainerFilter,
  ContainerState,
  PortMapping,
  HostConfig,
  NetworkSettings,
  NetworkInfo,
  MountPoint,
  ExecCommand,
  ExecResult,
  LogOptions,
  SandboxResult
} from '@shared/types/sandbox'

const execAsync = promisify(exec)

type DockerContainerInfo = Awaited<ReturnType<Docker['listContainers']>>[number]
type DockerContainerInspect = Awaited<ReturnType<ReturnType<Docker['getContainer']>['inspect']>>

function serialize<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      // 处理 BigInt 类型（Docker API 可能返回 BigInt 时间戳）
      if (typeof value === 'bigint') {
        return Number(value)
      }
      // 处理 Buffer/Uint8Array
      if (Buffer.isBuffer(value)) {
        return value.toString('base64')
      }
      if (value instanceof Uint8Array) {
        return Buffer.from(value).toString('base64')
      }
      return value
    })
  )
}

export class DockerService {
  private docker: Docker | null = null
  private initialized: boolean = false

  initialize(): void {
    if (this.initialized) return

    try {
      this.docker = new Docker()
      this.initialized = true
      logger.info('Docker 服务初始化成功')
    } catch (error) {
      const errorMessage = `Docker 服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.docker) {
      throw new Error('Docker 服务未初始化')
    }
  }

  async checkAvailable(): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      this.ensureInitialized()
      const version = await this.docker!.version()
      return {
        available: true,
        version: version.Version
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn('Docker 不可用', 'main', { error: errorMessage })
      return {
        available: false,
        error: errorMessage
      }
    }
  }

  async listContainers(filter?: ContainerFilter): Promise<ContainerInfo[]> {
    this.ensureInitialized()

    try {
      const opts: Docker.ContainerListOptions = { all: true }

      if (filter?.state && filter.state !== 'all') {
        if (filter.state === 'running') {
          opts.filters = { status: ['running'] }
        } else if (filter.state === 'stopped') {
          opts.filters = { status: ['exited', 'dead'] }
        } else {
          opts.filters = { status: [filter.state] }
        }
      }

      logger.info('[DockerService] 调用 Docker API listContainers', 'main', { opts })
      const containers = await this.docker!.listContainers(opts)
      logger.info('[DockerService] Docker API 返回原始数据', 'main', {
        count: containers.length,
        firstContainerType: containers[0] ? typeof containers[0] : null,
        firstContainerKeys: containers[0] ? Object.keys(containers[0]) : null
      })

      const serializedContainers = serialize(containers)
      logger.info('[DockerService] 序列化后数据', 'main', {
        count: serializedContainers.length,
        sample: JSON.stringify(serializedContainers[0]).substring(0, 500)
      })

      let result = serializedContainers.map((c: DockerContainerInfo) => this.mapContainerInfo(c))

      if (filter?.name) {
        const query = filter.name.toLowerCase()
        result = result.filter((c) => c.names.some((n) => n.toLowerCase().includes(query)))
      }

      if (filter?.image) {
        const query = filter.image.toLowerCase()
        result = result.filter((c) => c.image.toLowerCase().includes(query))
      }

      const finalResult = serialize(result)
      logger.info('[DockerService] 最终结果', 'main', {
        count: finalResult.length,
        sample: JSON.stringify(finalResult[0]).substring(0, 500)
      })

      return finalResult
    } catch (error) {
      logger.error('[DockerService] 获取容器列表失败', 'main', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      return []
    }
  }

  async getContainerDetails(containerId: string): Promise<ContainerDetails | null> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      const rawInfo = await container.inspect()
      const info = serialize(rawInfo)
      const baseInfo = await this.getContainerBaseInfo(containerId)

      const cmd = info.Config?.Cmd
      const entrypoint = info.Config?.Entrypoint

      return serialize({
        ...baseInfo,
        hostConfig: this.mapHostConfig(info),
        networkSettings: this.mapNetworkSettings(info),
        mounts: this.mapMounts(info),
        env: info.Config?.Env || [],
        cmd: Array.isArray(cmd) ? cmd : cmd ? [cmd] : [],
        workingDir: info.Config?.WorkingDir || '',
        entrypoint: Array.isArray(entrypoint) ? entrypoint : entrypoint ? [entrypoint] : []
      })
    } catch (error) {
      logger.error('获取容器详情失败', 'main', { error, containerId })
      return null
    }
  }

  async getContainerStats(containerId: string): Promise<ContainerStats | null> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      const rawStats = await container.stats({ stream: false })
      const stats = serialize(rawStats)

      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
      const cpuPercent =
        systemDelta > 0 && cpuDelta > 0
          ? (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100
          : 0

      const memoryUsage = stats.memory_stats.usage || 0
      const memoryLimit = stats.memory_stats.limit || 1
      const memoryPercent = (memoryUsage / memoryLimit) * 100

      let rxBytes = 0
      let txBytes = 0
      if (stats.networks) {
        for (const net of Object.values(stats.networks)) {
          rxBytes += (net as { rx_bytes?: number }).rx_bytes || 0
          txBytes += (net as { tx_bytes?: number }).tx_bytes || 0
        }
      }

      let readBytes = 0
      let writeBytes = 0
      if (stats.blkio_stats?.io_service_bytes_recursive) {
        for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
          if (entry?.op === 'read') readBytes += entry.value || 0
          if (entry?.op === 'write') writeBytes += entry.value || 0
        }
      }

      return serialize({
        cpu: Math.round(cpuPercent * 100) / 100,
        memory: {
          usage: memoryUsage,
          limit: memoryLimit,
          percent: Math.round(memoryPercent * 100) / 100
        },
        network: {
          rxBytes,
          txBytes
        },
        blockIO: {
          readBytes,
          writeBytes
        }
      })
    } catch (error) {
      logger.error('获取容器统计失败', 'main', { error, containerId })
      return null
    }
  }

  async startContainer(containerId: string): Promise<SandboxResult> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      await container.start()
      logger.info('容器启动成功', 'main', { containerId: containerId.substring(0, 12) })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('容器启动失败', 'main', { error: errorMessage, containerId })
      return { success: false, error: errorMessage }
    }
  }

  async stopContainer(containerId: string, timeout?: number): Promise<SandboxResult> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      await container.stop({ t: timeout || 10 })
      logger.info('容器停止成功', 'main', { containerId: containerId.substring(0, 12) })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('容器停止失败', 'main', { error: errorMessage, containerId })
      return { success: false, error: errorMessage }
    }
  }

  async restartContainer(containerId: string): Promise<SandboxResult> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      await container.restart()
      logger.info('容器重启成功', 'main', { containerId: containerId.substring(0, 12) })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('容器重启失败', 'main', { error: errorMessage, containerId })
      return { success: false, error: errorMessage }
    }
  }

  async removeContainer(containerId: string, force?: boolean): Promise<SandboxResult> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      await container.remove({ force: force || false })
      logger.info('容器删除成功', 'main', { containerId: containerId.substring(0, 12) })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('容器删除失败', 'main', { error: errorMessage, containerId })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 检查单个容器是否存在
   * @param containerId 容器 ID
   * @returns 容器是否存在
   */
  async containerExists(containerId: string): Promise<boolean> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      await container.inspect()
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      // 404 表示容器不存在，其他错误也认为不可用
      if (errorMessage.includes('404') || errorMessage.includes('No such container')) {
        return false
      }
      logger.warn('检查容器存在性失败', 'main', { error: errorMessage, containerId })
      return false
    }
  }

  /**
   * 批量检查多个容器是否存在
   * @param containerIds 容器 ID 数组
   * @returns 容器 ID 到存在性的映射
   */
  async containersExist(containerIds: string[]): Promise<Map<string, boolean>> {
    this.ensureInitialized()

    const result = new Map<string, boolean>()

    // 并发检查所有容器
    await Promise.all(
      containerIds.map(async (containerId) => {
        result.set(containerId, await this.containerExists(containerId))
      })
    )

    return result
  }

  /**
   * 根据 Compose 项目名获取所有关联容器
   * @param projectName Compose 项目名称
   * @returns 关联的容器列表
   */
  async getContainersByComposeProject(projectName: string): Promise<ContainerInfo[]> {
    this.ensureInitialized()

    try {
      // 使用 state: 'all' 获取所有状态的容器
      const allContainers = await this.listContainers({ state: 'all' })
      // Docker Compose 会给容器添加标签: com.docker.compose.project=<project-name>
      const composeLabel = `com.docker.compose.project=${projectName}`

      return allContainers.filter((container) => {
        // 检查容器的 labels 中是否有对应的 Compose 项目标签
        return Object.entries(container.labels).some(
          ([key, value]) => `${key}=${value}` === composeLabel
        )
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 Compose 项目容器失败', 'main', { error: errorMessage, projectName })
      return []
    }
  }

  /**
   * 执行 docker-compose down 命令
   * @param projectName Compose 项目名称
   * @returns 操作结果
   */
  async composeDown(projectName: string): Promise<SandboxResult> {
    this.ensureInitialized()

    try {
      // 使用 docker compose down 命令（新版 Docker CLI）
      // 也可以使用 docker-compose down（需要单独安装 docker-compose）
      const { stdout, stderr } = await execAsync(`docker compose -p "${projectName}" down`, {
        timeout: 60000, // 60 秒超时
        maxBuffer: 1024 * 1024 * 10 // 10MB 缓冲区
      })

      logger.info('Docker Compose down 成功', 'main', {
        projectName,
        stdout
      })

      // 如果有 stderr 输出但命令成功，记录警告
      if (stderr) {
        logger.warn('Docker Compose down 有警告输出', 'main', {
          projectName,
          stderr
        })
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Docker Compose down 失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }

  async execCommand(containerId: string, command: ExecCommand): Promise<ExecResult | null> {
    this.ensureInitialized()

    const startTime = Date.now()

    try {
      const container = this.docker!.getContainer(containerId)
      const exec = await container.exec({
        Cmd: ['sh', '-c', command.command],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: command.workdir,
        Env: command.env ? Object.entries(command.env).map(([k, v]) => `${k}=${v}`) : undefined
      })

      const stream = await exec.start({})
      const chunks: Buffer[] = []

      return new Promise((resolve) => {
        const timeout = setTimeout(
          () => {
            stream.destroy()
            resolve({
              exitCode: -1,
              stdout: '',
              stderr: '命令执行超时',
              duration: Date.now() - startTime
            })
          },
          (command.timeout || 30) * 1000
        )

        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        stream.on('end', async () => {
          clearTimeout(timeout)
          const output = Buffer.concat(chunks).toString('utf-8')
          const inspect = await exec.inspect()

          resolve({
            exitCode: inspect.ExitCode || 0,
            stdout: output,
            stderr: '',
            duration: Date.now() - startTime
          })
        })

        stream.on('error', (err: Error) => {
          clearTimeout(timeout)
          resolve({
            exitCode: -1,
            stdout: '',
            stderr: err.message,
            duration: Date.now() - startTime
          })
        })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('执行命令失败', 'main', {
        error: errorMessage,
        containerId,
        command: command.command
      })
      return {
        exitCode: -1,
        stdout: '',
        stderr: errorMessage,
        duration: Date.now() - startTime
      }
    }
  }

  async getContainerLogs(containerId: string, options?: LogOptions): Promise<string> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: options?.tail || 100,
        follow: false,
        since: options?.since,
        until: options?.until,
        timestamps: true
      })

      return logs.toString('utf-8')
    } catch (error) {
      logger.error('获取容器日志失败', 'main', { error, containerId })
      return ''
    }
  }

  async copyToContainer(
    containerId: string,
    source: string,
    target: string
  ): Promise<SandboxResult> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      const fs = await import('fs')

      const content = fs.readFileSync(source)

      await container.putArchive(content, { path: target })

      logger.info('文件复制到容器成功', 'main', {
        containerId: containerId.substring(0, 12),
        source,
        target
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('复制文件到容器失败', 'main', {
        error: errorMessage,
        containerId,
        source,
        target
      })
      return { success: false, error: errorMessage }
    }
  }

  async copyFromContainer(
    containerId: string,
    source: string,
    target: string
  ): Promise<SandboxResult> {
    this.ensureInitialized()

    try {
      const container = this.docker!.getContainer(containerId)
      const stream = await container.getArchive({ path: source })

      return new Promise((resolve) => {
        const chunks: Buffer[] = []

        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', async () => {
          try {
            const content = Buffer.concat(chunks)
            const fs = await import('fs')
            fs.writeFileSync(target, content)

            logger.info('从容器复制文件成功', 'main', {
              containerId: containerId.substring(0, 12),
              source,
              target
            })

            resolve({ success: true })
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            resolve({ success: false, error: errorMessage })
          }
        })
        stream.on('error', (err: Error) => {
          resolve({ success: false, error: err.message })
        })
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('从容器复制文件失败', 'main', {
        error: errorMessage,
        containerId,
        source,
        target
      })
      return { success: false, error: errorMessage }
    }
  }

  private async getContainerBaseInfo(containerId: string): Promise<ContainerInfo> {
    const containers = await this.docker!.listContainers({ all: true })
    const found = containers.find((c) => c.Id === containerId || c.Id.startsWith(containerId))
    if (!found) {
      throw new Error(`容器不存在: ${containerId}`)
    }
    return this.mapContainerInfo(found)
  }

  private mapContainerInfo(c: DockerContainerInfo): ContainerInfo {
    const ports: PortMapping[] = []
    if (c.Ports) {
      for (const p of c.Ports) {
        ports.push({
          hostPort: p.PublicPort,
          containerPort: p.PrivatePort,
          protocol: (p.Type as 'tcp' | 'udp') || 'tcp'
        })
      }
    }

    return serialize({
      id: c.Id,
      shortId: c.Id.substring(0, 12),
      names: c.Names?.map((n) => n.replace(/^\//, '')) || [],
      image: c.Image || 'unknown',
      state: this.mapState(c.State),
      status: c.Status || '',
      ports,
      created: c.Created,
      labels: c.Labels || {}
    })
  }

  private mapState(state: string): ContainerState {
    const stateMap: Record<string, ContainerState> = {
      created: 'created',
      running: 'running',
      paused: 'paused',
      restarting: 'restarting',
      removing: 'removing',
      exited: 'exited',
      dead: 'dead'
    }
    return stateMap[state.toLowerCase()] || 'exited'
  }

  private mapHostConfig(info: DockerContainerInspect): HostConfig {
    const hostConfig = info.HostConfig as {
      Memory?: number
      CpuShares?: number
      CpuQuota?: number
      RestartPolicy?: { Name?: string }
      Privileged?: boolean
    }

    return {
      memory: hostConfig?.Memory || 0,
      cpuShares: hostConfig?.CpuShares || 0,
      cpuQuota: hostConfig?.CpuQuota || 0,
      restartPolicy: hostConfig?.RestartPolicy?.Name || 'no',
      privileged: hostConfig?.Privileged || false
    }
  }

  private mapNetworkSettings(info: DockerContainerInspect): NetworkSettings {
    const networks: Record<string, NetworkInfo> = {}
    const netSettings = (info.NetworkSettings?.Networks || {}) as Record<
      string,
      {
        NetworkID?: string
        IPAddress?: string
        Gateway?: string
        MacAddress?: string
      }
    >

    for (const [name, net] of Object.entries(netSettings)) {
      networks[name] = {
        networkId: net.NetworkID || '',
        ipAddress: net.IPAddress || '',
        gateway: net.Gateway || '',
        macAddress: net.MacAddress || ''
      }
    }

    const ports: Record<string, { hostIp: string; hostPort: string }[]> = {}
    const portBindings = (info.NetworkSettings?.Ports || {}) as Record<
      string,
      { HostIp?: string; HostPort?: string }[] | null
    >

    for (const [containerPort, bindings] of Object.entries(portBindings)) {
      if (bindings) {
        ports[containerPort] = bindings.map((b) => ({
          hostIp: b.HostIp || '0.0.0.0',
          hostPort: b.HostPort || ''
        }))
      }
    }

    return { networks, ports }
  }

  private mapMounts(info: DockerContainerInspect): MountPoint[] {
    const mounts: MountPoint[] = []
    const infoMounts = info.Mounts as
      | Array<{
          Type?: string
          Source?: string
          Destination?: string
          RW?: boolean
        }>
      | undefined

    if (infoMounts) {
      for (const m of infoMounts) {
        mounts.push({
          type: (m.Type as 'bind' | 'volume' | 'tmpfs') || 'bind',
          source: m.Source || '',
          destination: m.Destination || '',
          mode: m.RW ? 'rw' : 'ro'
        })
      }
    }
    return mounts
  }
}

let dockerServiceInstance: DockerService | null = null

export function getDockerService(): DockerService {
  if (!dockerServiceInstance) {
    dockerServiceInstance = new DockerService()
  }
  return dockerServiceInstance
}

export const dockerService = {
  initialize: () => getDockerService().initialize(),
  checkAvailable: () => getDockerService().checkAvailable(),
  listContainers: (filter?: ContainerFilter) => getDockerService().listContainers(filter),
  getContainerDetails: (id: string) => getDockerService().getContainerDetails(id),
  getContainerStats: (id: string) => getDockerService().getContainerStats(id),
  startContainer: (id: string) => getDockerService().startContainer(id),
  stopContainer: (id: string, timeout?: number) => getDockerService().stopContainer(id, timeout),
  restartContainer: (id: string) => getDockerService().restartContainer(id),
  removeContainer: (id: string, force?: boolean) => getDockerService().removeContainer(id, force),
  containerExists: (containerId: string) => getDockerService().containerExists(containerId),
  containersExist: (containerIds: string[]) => getDockerService().containersExist(containerIds),
  getContainersByComposeProject: (projectName: string) =>
    getDockerService().getContainersByComposeProject(projectName),
  composeDown: (projectName: string) => getDockerService().composeDown(projectName),
  execCommand: (id: string, cmd: ExecCommand) => getDockerService().execCommand(id, cmd),
  getContainerLogs: (id: string, opts?: LogOptions) =>
    getDockerService().getContainerLogs(id, opts),
  copyToContainer: (id: string, src: string, dest: string) =>
    getDockerService().copyToContainer(id, src, dest),
  copyFromContainer: (id: string, src: string, dest: string) =>
    getDockerService().copyFromContainer(id, src, dest)
}
