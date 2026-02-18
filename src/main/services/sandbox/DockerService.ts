import Docker from 'dockerode'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '@main/services/logger'
import { getDockerConfigService } from './DockerConfigService'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
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
  SandboxResult,
  ComposeStopOptions,
  ComposeStopResult,
  ComposeRestartResult,
  ComposeProjectStatus,
  ComposeServiceStatus,
  ComposeExecOptions,
  ComposeExecResult,
  ComposeLogOptions,
  ComposeLogResult,
  ComposeDownOptions,
  ComposeDownResult
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

  /**
   * 从 Dockerfile 内容构建 Docker 镜像
   * @param options 构建选项
   * @returns 构建结果
   */
  async buildImageFromDockerfile(options: {
    dockerfile: string
    context?: string
    tag?: string
    buildArgs?: Record<string, string>
  }): Promise<{ success: boolean; imageId?: string; error?: string; buildLog?: string }> {
    this.ensureInitialized()

    const buildLogChunks: string[] = []

    try {
      // 创建临时目录用于构建
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'docker-build-'))

      try {
        // 写入 Dockerfile
        const dockerfilePath = path.join(tempDir, 'Dockerfile')
        await fs.promises.writeFile(dockerfilePath, options.dockerfile, 'utf-8')

        // 如果提供了构建上下文，复制文件到临时目录
        if (options.context) {
          const contextPath = path.resolve(options.context)
          const contextStat = await fs.promises.stat(contextPath)

          if (contextStat.isDirectory()) {
            // 复制目录内容
            const files = await fs.promises.readdir(contextPath)
            await Promise.all(
              files.map(async (file) => {
                const srcPath = path.join(contextPath, file)
                const destPath = path.join(tempDir, file)
                await fs.promises.copyFile(srcPath, destPath)
              })
            )
          } else {
            // 复制单个文件
            const destPath = path.join(tempDir, path.basename(contextPath))
            await fs.promises.copyFile(contextPath, destPath)
          }
        }

        // 准备构建选项
        const buildOpts: Docker.ImageBuildOptions = {
          dockerfile: 'Dockerfile',
          t: options.tag || 'sparrow-manus-built'
        }

        if (options.buildArgs && Object.keys(options.buildArgs).length > 0) {
          buildOpts.buildargs = options.buildArgs
        }

        // 执行构建
        logger.info('开始构建 Docker 镜像', 'main', { tag: options.tag })

        return new Promise((resolve) => {
          // 使用回调模式获取构建流
          this.docker!.buildImage(
            {
              context: tempDir,
              src: ['.']
            },
            buildOpts,
            (err, buildStream) => {
              if (err) {
                logger.error('构建 Docker 镜像失败', 'main', { error: err.message })
                resolve({
                  success: false,
                  error: err.message,
                  buildLog: buildLogChunks.join('\n')
                })
                return
              }

              if (!buildStream) {
                resolve({
                  success: false,
                  error: '构建流创建失败',
                  buildLog: buildLogChunks.join('\n')
                })
                return
              }

              let hasBuildError = false
              let buildErrorMessage = ''

              buildStream.on('data', (chunk: Buffer) => {
                const lines = chunk.toString('utf-8').split('\n').filter(Boolean)
                for (const line of lines) {
                  try {
                    const json = JSON.parse(line)
                    if (json.stream) {
                      buildLogChunks.push(json.stream)
                      logger.debug(`构建: ${json.stream.trim()}`, 'main')
                    }
                    if (json.error) {
                      hasBuildError = true
                      buildErrorMessage = json.error
                      buildLogChunks.push(`ERROR: ${json.error}`)
                      logger.error('构建错误', 'main', { error: json.error })
                    }
                    if (json.aux?.ID) {
                      logger.info('镜像构建成功', 'main', { imageId: json.aux.ID })
                    }
                    // 捕获构建完成信息
                    if (json.aux?.Digest) {
                      logger.info('构建摘要', 'main', { digest: json.aux.Digest })
                    }
                  } catch {
                    // 无法解析为 JSON，直接添加日志
                    buildLogChunks.push(line)
                  }
                }
              })

              buildStream.on('end', () => {
                // 如果有构建错误，直接返回失败
                if (hasBuildError) {
                  logger.error('Docker 构建失败', 'main', {
                    error: buildErrorMessage,
                    tag: options.tag
                  })
                  resolve({
                    success: false,
                    error: `Docker 构建失败: ${buildErrorMessage}`,
                    buildLog: buildLogChunks.join('\n')
                  })
                  return
                }

                // 构建完成，尝试获取镜像 ID
                logger.info('构建流结束，开始查找镜像', 'main', { tag: options.tag })

                this.docker!.listImages()
                  .then((images) => {
                    logger.debug('获取到镜像列表', 'main', { count: images.length })

                    // 查找刚构建的镜像（通过 tag）
                    const targetTag = `${options.tag}:latest`
                    const builtImage = images.find((img) => {
                      if (options.tag && img.RepoTags) {
                        const hasTag = img.RepoTags.some(
                          (tag) => tag === targetTag || tag === options.tag
                        )
                        if (hasTag) {
                          logger.debug('找到匹配的镜像', 'main', {
                            id: img.Id.substring(0, 12),
                            tags: img.RepoTags
                          })
                        }
                        return hasTag
                      }
                      return false
                    })

                    if (builtImage) {
                      logger.info('镜像构建成功，找到匹配的镜像', 'main', {
                        imageId: builtImage.Id.substring(0, 12),
                        tag: options.tag,
                        repoTags: builtImage.RepoTags
                      })
                      resolve({
                        success: true,
                        imageId: builtImage.Id,
                        buildLog: buildLogChunks.join('\n')
                      })
                    } else {
                      // 找不到镜像，列出最近的镜像帮助调试
                      const recentImages = images
                        .filter((img) => img.RepoTags && !img.RepoTags.includes('<none>:<none>'))
                        .slice(0, 5)
                        .map((img) => ({ id: img.Id.substring(0, 12), tags: img.RepoTags }))

                      logger.error('构建完成但找不到镜像', 'main', {
                        tag: options.tag,
                        targetTag,
                        recentImages,
                        buildLog: buildLogChunks.join('\n').slice(-500)
                      })
                      resolve({
                        success: false,
                        error: '构建完成但找不到镜像，请检查 Dockerfile 是否正确',
                        buildLog: buildLogChunks.join('\n')
                      })
                    }
                  })
                  .catch((listError) => {
                    logger.error('获取镜像列表失败', 'main', { error: listError.message })
                    resolve({
                      success: false,
                      error: `获取镜像列表失败: ${listError.message}`,
                      buildLog: buildLogChunks.join('\n')
                    })
                  })
              })

              buildStream.on('error', (err: Error) => {
                logger.error('构建 Docker 镜像失败', 'main', { error: err.message })
                resolve({
                  success: false,
                  error: err.message,
                  buildLog: buildLogChunks.join('\n')
                })
              })
            }
          )
        })
      } finally {
        // 清理临时目录
        try {
          await fs.promises.rm(tempDir, { recursive: true, force: true })
        } catch (err) {
          logger.warn('清理临时目录失败', 'main', { error: err })
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('构建 Docker 镜像失败', 'main', { error: errorMessage })
      return {
        success: false,
        error: errorMessage,
        buildLog: buildLogChunks.join('\n')
      }
    }
  }

  /**
   * 获取镜像详细信息
   * @param imageId 镜像 ID
   * @returns 镜像信息
   */
  async inspectImage(imageId: string): Promise<Docker.ImageInspectInfo | null> {
    this.ensureInitialized()

    try {
      const image = this.docker!.getImage(imageId)
      const info = await image.inspect()
      return info
    } catch (error) {
      logger.error('获取镜像信息失败', 'main', { imageId, error: String(error) })
      return null
    }
  }

  /**
   * 从镜像创建并启动容器
   * @param options 创建容器选项
   * @returns 创建结果
   */
  async createContainerFromImage(options: {
    imageId: string
    name?: string
    env?: string[]
    ports?: Array<{ containerPort: number; hostPort?: number; protocol?: 'tcp' | 'udp' }>
    volumes?: Array<{ source: string; destination: string; mode?: 'rw' | 'ro' }>
    workingDir?: string
    cmd?: string[]
  }): Promise<{ success: boolean; containerId?: string; error?: string }> {
    this.ensureInitialized()

    try {
      // 准备端口映射
      const portBindings: Record<string, Array<{ HostPort?: string; HostIp?: string }>> = {}
      const exposedPorts: Record<string, object> = {}

      if (options.ports) {
        for (const port of options.ports) {
          const portKey = `${port.containerPort}/${port.protocol || 'tcp'}`
          exposedPorts[portKey] = {}
          // 如果指定了 hostPort 则使用，否则 Docker 会自动分配
          if (port.hostPort !== undefined) {
            portBindings[portKey] = [{ HostPort: String(port.hostPort), HostIp: '0.0.0.0' }]
          } else {
            // 不指定 HostPort，Docker 会自动分配一个可用端口
            portBindings[portKey] = [{ HostIp: '0.0.0.0' }]
          }
        }
      }

      // 准备卷映射
      const binds: string[] = []
      if (options.volumes) {
        for (const vol of options.volumes) {
          const mode = vol.mode || 'rw'
          binds.push(`${vol.source}:${vol.destination}:${mode}`)
        }
      }

      // 准备容器配置
      const containerConfig: Docker.ContainerCreateOptions = {
        Image: options.imageId,
        name: options.name,
        Env: options.env,
        ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
        HostConfig: {
          PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
          Binds: binds.length > 0 ? binds : undefined
        },
        WorkingDir: options.workingDir,
        Cmd: options.cmd
      }

      logger.info('创建容器', 'main', {
        image: options.imageId,
        name: options.name
      })

      // 创建容器
      const container = await this.docker!.createContainer(containerConfig)

      // 启动容器
      await container.start()

      logger.info('容器创建并启动成功', 'main', {
        containerId: container.id.substring(0, 12),
        name: options.name
      })

      // 异步清理悬空资源（不阻塞返回）
      this.cleanupDanglingResources().catch(() => {})

      return {
        success: true,
        containerId: container.id
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('创建容器失败', 'main', {
        error: errorMessage,
        image: options.imageId,
        name: options.name
      })
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 去除 docker-compose.yaml 中的重复服务定义
   * 只保留每个服务的最后一个定义
   * 使用更可靠的缩进分析算法
   */
  private deduplicateServices(content: string): string {
    const lines = content.split('\n')
    
    // 找到 services: 的位置和缩进级别
    let servicesLineIndex = -1
    let servicesIndent = -1
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed === 'services:' || trimmed.startsWith('services:')) {
        servicesLineIndex = i
        servicesIndent = lines[i].search(/\S/)
        break
      }
    }
    
    // 如果没有找到 services 部分，直接返回原内容
    if (servicesLineIndex === -1) {
      return content
    }
    
    // 收集所有服务的位置信息
    // serviceIndent = servicesIndent + 2 (服务定义比 services: 多2个空格缩进)
    const serviceIndent = servicesIndent + 2
    const serviceOccurrences: Map<string, Array<{ start: number; end: number }>> = new Map()
    
    let currentService: string | null = null
    let serviceStart = -1
    
    for (let i = servicesLineIndex + 1; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      
      // 跳过空行
      if (!trimmed) continue
      
      // 计算当前行的缩进
      const lineIndent = line.search(/\S/)
      
      // 如果缩进小于等于 servicesIndent，说明已经离开 services 块
      if (lineIndent <= servicesIndent && lineIndent !== -1) {
        // 结束前一个服务
        if (currentService && serviceStart >= 0) {
          const occurrences = serviceOccurrences.get(currentService) || []
          occurrences.push({ start: serviceStart, end: i })
          serviceOccurrences.set(currentService, occurrences)
        }
        currentService = null
        break
      }
      
      // 检测服务定义（缩进等于 serviceIndent 且符合服务名格式）
      if (lineIndent === serviceIndent) {
        // 结束前一个服务
        if (currentService && serviceStart >= 0) {
          const occurrences = serviceOccurrences.get(currentService) || []
          occurrences.push({ start: serviceStart, end: i })
          serviceOccurrences.set(currentService, occurrences)
        }
        
        // 检测是否是服务定义（服务名 + 冒号）
        const serviceMatch = trimmed.match(/^([a-zA-Z0-9_-]+):/)
        if (serviceMatch) {
          currentService = serviceMatch[1]
          serviceStart = i
        } else {
          currentService = null
          serviceStart = -1
        }
      }
    }
    
    // 处理最后一个服务（如果文件结束）
    if (currentService && serviceStart >= 0) {
      const occurrences = serviceOccurrences.get(currentService) || []
      occurrences.push({ start: serviceStart, end: lines.length })
      serviceOccurrences.set(currentService, occurrences)
    }
    
    // 找出需要跳过的行范围（重复服务的非最后一次定义）
    const skipRanges: Array<{ start: number; end: number }> = []
    let hasDuplicates = false
    
    for (const [serviceName, occurrences] of serviceOccurrences) {
      if (occurrences.length > 1) {
        hasDuplicates = true
        // 只保留最后一次定义，其他都要跳过
        for (let i = 0; i < occurrences.length - 1; i++) {
          skipRanges.push(occurrences[i])
        }
        logger.info('检测到重复服务定义', 'main', {
          service: serviceName,
          occurrences: occurrences.length,
          keptRange: occurrences[occurrences.length - 1]
        })
      }
    }
    
    // 如果没有重复，直接返回原内容
    if (!hasDuplicates) {
      return content
    }
    
    // 按起始位置排序
    skipRanges.sort((a, b) => a.start - b.start)
    
    // 构建结果，跳过重复的定义
    const result: string[] = []
    for (let i = 0; i < lines.length; i++) {
      let shouldSkip = false
      for (const range of skipRanges) {
        if (i >= range.start && i < range.end) {
          shouldSkip = true
          break
        }
      }
      if (!shouldSkip) {
        result.push(lines[i])
      }
    }
    
    logger.info('去除重复服务定义完成', 'main', {
      originalLines: lines.length,
      cleanedLines: result.length,
      skipRanges: skipRanges.length
    })
    
    return result.join('\n')
  }

  /**
   * 解析 compose 文件中的 build 配置
   * @param content docker-compose.yaml 内容
   * @returns 构建上下文配置列表
   */
  private parseBuildContexts(content: string): Array<{
    service: string
    context: string
    dockerfile?: string
  }> {
    const contexts: Array<{ service: string; context: string; dockerfile?: string }> = []
    const lines = content.split('\n')
    
    // 找到 services: 的位置和缩进级别
    let servicesLineIndex = -1
    let servicesIndent = -1
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed === 'services:' || trimmed.startsWith('services:')) {
        servicesLineIndex = i
        servicesIndent = lines[i].search(/\S/)
        break
      }
    }
    
    if (servicesLineIndex === -1) {
      return contexts
    }
    
    const serviceIndent = servicesIndent + 2
    let currentService: string | null = null
    let currentContext: string | null = null
    let currentDockerfile: string | undefined
    let inBuildBlock = false
    let buildBlockIndent = -1
    
    for (let i = servicesLineIndex + 1; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      
      // 跳过空行
      if (!trimmed) continue
      
      const lineIndent = line.search(/\S/)
      
      // 如果缩进小于等于 servicesIndent，说明已经离开 services 块
      if (lineIndent <= servicesIndent && lineIndent !== -1) {
        break
      }
      
      // 检测服务定义（serviceIndent 级别）
      if (lineIndent === serviceIndent) {
        // 保存之前服务的 build 配置
        if (currentService && currentContext) {
          contexts.push({
            service: currentService,
            context: currentContext,
            dockerfile: currentDockerfile
          })
        }
        
        const serviceMatch = trimmed.match(/^([a-zA-Z0-9_-]+):/)
        if (serviceMatch) {
          currentService = serviceMatch[1]
          currentContext = null
          currentDockerfile = undefined
          inBuildBlock = false
          buildBlockIndent = -1
        } else {
          currentService = null
        }
        continue
      }
      
      // 在当前服务内且缩进正确时检测 build 配置
      if (currentService && lineIndent > serviceIndent) {
        const relativeIndent = lineIndent - serviceIndent
        
        // build: 简写形式 (如 build: ./context)
        // 必须是服务直接下级（相对缩进为2）
        const buildShorthandMatch = trimmed.match(/^build:\s*(\S+)\s*$/)
        if (buildShorthandMatch && relativeIndent === 2) {
          const buildValue = buildShorthandMatch[1].trim()
          // 如果值是相对路径（以 . 开头），则为简写形式
          if (buildValue.startsWith('.')) {
            currentContext = buildValue
            inBuildBlock = false
            buildBlockIndent = -1
          } else {
            // 可能是其他值，但也可能是对象形式的开始
            // 检查下一行是否是缩进的
            const nextLine = lines[i + 1]
            if (nextLine) {
              const nextIndent = nextLine.search(/\S/)
              if (nextIndent > lineIndent) {
                // 下一行更缩进，说明是对象形式
                inBuildBlock = true
                buildBlockIndent = lineIndent
              } else {
                // 不是对象形式，直接使用这个值
                currentContext = buildValue
              }
            }
          }
          continue
        }
        
        // build: 对象形式开始（只有 build: 没有值，或下一行缩进）
        if (trimmed === 'build:' && relativeIndent === 2) {
          inBuildBlock = true
          buildBlockIndent = lineIndent
          continue
        }
        
        // 在 build 块内解析 context 和 dockerfile
        if (inBuildBlock && lineIndent > buildBlockIndent) {
          const contextMatch = trimmed.match(/^context:\s*(.+)$/)
          if (contextMatch) {
            currentContext = contextMatch[1].trim()
          }
          
          const dockerfileMatch = trimmed.match(/^dockerfile:\s*(.+)$/)
          if (dockerfileMatch) {
            currentDockerfile = dockerfileMatch[1].trim()
          }
        }
        
        // 检测是否离开 build 块（当前行缩进 <= buildBlockIndent）
        if (inBuildBlock && lineIndent <= buildBlockIndent) {
          inBuildBlock = false
        }
      }
    }
    
    // 处理最后一个服务
    if (currentService && currentContext) {
      contexts.push({
        service: currentService,
        context: currentContext,
        dockerfile: currentDockerfile
      })
    }
    
    logger.info('解析到构建上下文配置', 'main', {
      count: contexts.length,
      contexts: contexts.map(c => ({ service: c.service, context: c.context }))
    })
    
    return contexts
  }
  
  /**
   * 根据服务名推断基础镜像
   * @param serviceName 服务名称
   * @returns 推荐的基础镜像
   */
  private inferBaseImage(serviceName: string): string {
    const name = serviceName.toLowerCase()
    
    // 常见服务映射
    const imageMap: Record<string, string> = {
      'mysql': 'mysql:latest',
      'mariadb': 'mariadb:latest',
      'postgres': 'postgres:latest',
      'postgresql': 'postgres:latest',
      'redis': 'redis:latest',
      'mongo': 'mongo:latest',
      'mongodb': 'mongo:latest',
      'nginx': 'nginx:latest',
      'apache': 'httpd:latest',
      'node': 'node:latest',
      'python': 'python:latest',
      'java': 'openjdk:latest',
      'go': 'golang:latest',
      'php': 'php:latest',
      'ruby': 'ruby:latest'
    }
    
    for (const [key, image] of Object.entries(imageMap)) {
      if (name.includes(key)) {
        return image
      }
    }
    
    // 默认使用 alpine
    return 'alpine:latest'
  }
  
  /**
   * 递归复制目录
   * @param src 源目录
   * @param dest 目标目录
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.promises.mkdir(dest, { recursive: true })
    const entries = await fs.promises.readdir(src, { withFileTypes: true })
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath)
      } else {
        await fs.promises.copyFile(srcPath, destPath)
      }
    }
  }

  /**
   * 执行 docker-compose up 命令
   * @param options Compose up 选项
   * @returns 操作结果
   */
  async composeUp(options: {
    composeContent: string
    projectName: string
    workingDir?: string
    /** 要复制的 Dockerfile 配置列表 */
    dockerfileConfigs?: Array<{
      id: string
      content: string
      targetContext: string
      targetFilename: string
    }>
  }): Promise<{ success: boolean; containerIds?: string[]; error?: string; upLog?: string }> {
    this.ensureInitialized()

    const upLogChunks: string[] = []

    try {
      // 创建临时目录用于存放 compose 文件
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'docker-compose-'))

      try {
        // 写入 docker-compose.yaml（先去除重复服务）
        let cleanedContent = this.deduplicateServices(options.composeContent)
        const composePath = path.join(tempDir, 'docker-compose.yaml')
        await fs.promises.writeFile(composePath, cleanedContent, 'utf-8')

        // 解析 compose 文件中的 build 配置，创建必要的构建上下文目录
        const buildContexts = this.parseBuildContexts(cleanedContent)
        
        // 加载所有保存的 Dockerfile 配置用于自动匹配
        const configService = getDockerConfigService()
        const savedDockerfiles = configService.listDockerfiles().configs || []
        
        for (const ctx of buildContexts) {
          const contextDir = path.join(tempDir, ctx.context)
          
          // 检查目录是否已存在（可能通过 dockerfileConfigs 创建）
          try {
            await fs.promises.access(contextDir)
            logger.debug('构建上下文目录已存在', 'main', { context: ctx.context })
          } catch {
            // 目录不存在，创建它
            await fs.promises.mkdir(contextDir, { recursive: true })
            logger.info('创建构建上下文目录', 'main', { 
              context: ctx.context,
              service: ctx.service 
            })
            
            // 检查是否有匹配的保存的 Dockerfile 配置
            // 根据上下文路径名匹配（如 ./MySQL8 匹配 MySQL8）
            const contextName = path.basename(ctx.context)
            const matchingConfig = savedDockerfiles.find(df => 
              df.name.toLowerCase() === contextName.toLowerCase()
            )
            
            const dockerfileName = ctx.dockerfile || 'Dockerfile'
            const dockerfilePath = path.join(contextDir, dockerfileName)
            
            if (matchingConfig) {
              // 找到匹配的 Dockerfile 配置，加载其内容
              const loadResult = configService.loadDockerfile(matchingConfig.id)
              if (loadResult.success && loadResult.config) {
                await fs.promises.writeFile(dockerfilePath, loadResult.config.content, 'utf-8')
                logger.info('从保存的 Dockerfile 配置加载', 'main', { 
                  service: ctx.service,
                  context: ctx.context,
                  configId: matchingConfig.id,
                  configName: matchingConfig.name
                })
              } else {
                logger.warn('加载 Dockerfile 配置失败，使用默认配置', 'main', {
                  configId: matchingConfig.id,
                  error: loadResult.error
                })
                // 创建默认 Dockerfile
                const defaultImage = this.inferBaseImage(ctx.service)
                const defaultDockerfile = `FROM ${defaultImage}\n\nWORKDIR /app\n\n# 默认 Dockerfile，请根据实际需要修改\n`
                await fs.promises.writeFile(dockerfilePath, defaultDockerfile, 'utf-8')
              }
            } else {
              // 没有找到匹配的 Dockerfile 配置，创建默认的
              const defaultImage = this.inferBaseImage(ctx.service)
              const defaultDockerfile = `FROM ${defaultImage}\n\nWORKDIR /app\n\n# 默认 Dockerfile，请根据实际需要修改\n`
              await fs.promises.writeFile(dockerfilePath, defaultDockerfile, 'utf-8')
              logger.info('创建默认 Dockerfile', 'main', { 
                service: ctx.service,
                dockerfile: dockerfileName,
                image: defaultImage
              })
            }
          }
        }

        // 如果提供了 Dockerfile 配置，复制到临时目录
        if (options.dockerfileConfigs && options.dockerfileConfigs.length > 0) {
          for (const dfConfig of options.dockerfileConfigs) {
            // 创建目标上下文目录
            const contextDir = path.join(tempDir, dfConfig.targetContext)
            await fs.promises.mkdir(contextDir, { recursive: true })

            // 写入 Dockerfile
            const dockerfilePath = path.join(contextDir, dfConfig.targetFilename)
            await fs.promises.writeFile(dockerfilePath, dfConfig.content, 'utf-8')

            logger.info('复制 Dockerfile 配置到临时目录', 'main', {
              id: dfConfig.id,
              targetPath: path.join(dfConfig.targetContext, dfConfig.targetFilename)
            })
          }
        }

        // 如果提供了工作目录内容，复制到临时目录
        if (options.workingDir) {
          const workPath = path.resolve(options.workingDir)
          const workStat = await fs.promises.stat(workPath)

          if (workStat.isDirectory()) {
            // 复制目录内容（排除 docker-compose.yaml）
            const files = await fs.promises.readdir(workPath)
            await Promise.all(
              files
                .filter((file) => file !== 'docker-compose.yaml' && file !== 'docker-compose.yml')
                .map(async (file) => {
                  const srcPath = path.join(workPath, file)
                  const destPath = path.join(tempDir, file)
                  try {
                    const srcStat = await fs.promises.stat(srcPath)
                    if (srcStat.isDirectory()) {
                      // 递归复制目录
                      await this.copyDirectory(srcPath, destPath)
                    } else {
                      await fs.promises.copyFile(srcPath, destPath)
                    }
                  } catch (err) {
                    logger.warn('复制工作目录文件失败', 'main', { file, error: err })
                  }
                })
            )
          }
        }

        // 执行 docker compose up 命令
        logger.info('执行 Docker Compose up', 'main', {
          projectName: options.projectName,
          composePath
        })

        const command = `cd "${tempDir}" && docker compose -p "${options.projectName}" up -d`

        const { stdout, stderr } = await execAsync(command, {
          timeout: 120000, // 2 分钟超时
          maxBuffer: 1024 * 1024 * 10 // 10MB 缓冲区
        })

        upLogChunks.push(stdout)

        if (stderr) {
          upLogChunks.push(`WARNING: ${stderr}`)
          logger.warn('Docker Compose up 有警告输出', 'main', {
            projectName: options.projectName,
            stderr
          })
        }

        // 获取创建的容器列表
        const containers = await this.getContainersByComposeProject(options.projectName)
        const containerIds = containers.map((c) => c.id)

        logger.info('Docker Compose up 成功', 'main', {
          projectName: options.projectName,
          containerCount: containerIds.length
        })

        return {
          success: true,
          containerIds,
          upLog: upLogChunks.join('\n')
        }
      } finally {
        // 清理临时目录（但保留 compose 文件以便调试）
        try {
          await fs.promises.rm(tempDir, { recursive: true, force: true })
        } catch (err) {
          logger.warn('清理临时目录失败', 'main', { error: err })
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Docker Compose up 失败', 'main', {
        error: errorMessage,
        projectName: options.projectName
      })
      return {
        success: false,
        error: errorMessage,
        upLog: upLogChunks.join('\n')
      }
    }
  }

  /**
   * 清理悬空镜像和已退出的临时容器
   */
  async cleanupDanglingResources(): Promise<void> {
    this.ensureInitialized()

    try {
      // 清理悬空镜像 (none 标签的镜像)
      const images = await this.docker!.listImages({ filters: { dangling: ['true'] } })
      for (const image of images) {
        try {
          await this.docker!.getImage(image.Id).remove({ force: true })
          logger.info('已清理悬空镜像', 'main', { imageId: image.Id.substring(0, 12) })
        } catch {
          // 忽略删除失败
        }
      }

      // 清理已退出的匿名容器 (没有名称或名称为自动生成的)
      const containers = await this.docker!.listContainers({ all: true })
      for (const containerInfo of containers) {
        if (
          containerInfo.State === 'exited' &&
          containerInfo.Names.some(
            (name) => name.startsWith('/') && name.length > 12 && !name.includes('sandbox-')
          )
        ) {
          // 检查是否是自动生成的名称 (如 /fervent_chebyshev)
          const name = containerInfo.Names[0].replace('/', '')
          const isAutoGenerated = /^[a-z]+_[a-z]+$/i.test(name)
          if (isAutoGenerated) {
            try {
              await this.docker!.getContainer(containerInfo.Id).remove({ force: true })
              logger.info('已清理匿名容器', 'main', {
                containerId: containerInfo.Id.substring(0, 12),
                name
              })
            } catch {
              // 忽略删除失败
            }
          }
        }
      }
    } catch (error) {
      logger.error('清理资源失败', 'main', { error: String(error) })
    }
  }

  // ==================== Compose 项目操作 ====================

  /**
   * 停止 Compose 项目所有容器
   * @param projectName Compose 项目名称
   * @param options 停止选项
   * @returns 操作结果
   */
  async composeStop(
    projectName: string,
    options?: ComposeStopOptions
  ): Promise<ComposeStopResult> {
    this.ensureInitialized()

    try {
      // 获取项目的所有容器
      const containers = await this.getContainersByComposeProject(projectName)

      if (containers.length === 0) {
        logger.warn('Compose 项目没有运行的容器', 'main', { projectName })
        return { success: true, stoppedContainerIds: [] }
      }

      const stoppedContainerIds: string[] = []

      // 停止所有容器
      for (const container of containers) {
        if (container.state === 'running') {
          const result = await this.stopContainer(container.id, options?.timeout)
          if (result.success) {
            stoppedContainerIds.push(container.id)
          }
        }
      }

      logger.info('Compose 项目容器停止成功', 'main', {
        projectName,
        stoppedCount: stoppedContainerIds.length
      })

      return { success: true, stoppedContainerIds }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('停止 Compose 项目失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 重启 Compose 项目所有容器
   * @param projectName Compose 项目名称
   * @returns 操作结果
   */
  async composeRestart(projectName: string): Promise<ComposeRestartResult> {
    this.ensureInitialized()

    try {
      // 获取项目的所有容器
      const containers = await this.getContainersByComposeProject(projectName)

      if (containers.length === 0) {
        logger.warn('Compose 项目没有容器', 'main', { projectName })
        return { success: true, restartedContainerIds: [] }
      }

      const restartedContainerIds: string[] = []

      // 重启所有容器
      for (const container of containers) {
        const result = await this.restartContainer(container.id)
        if (result.success) {
          restartedContainerIds.push(container.id)
        }
      }

      logger.info('Compose 项目容器重启成功', 'main', {
        projectName,
        restartedCount: restartedContainerIds.length
      })

      return { success: true, restartedContainerIds }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('重启 Compose 项目失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 获取 Compose 项目状态
   * @param projectName Compose 项目名称
   * @returns 项目状态
   */
  async composeStatus(projectName: string): Promise<{ success: boolean; status?: ComposeProjectStatus; error?: string }> {
    this.ensureInitialized()

    try {
      const containers = await this.getContainersByComposeProject(projectName)

      // 从容器标签中提取服务信息
      const servicesMap = new Map<string, ComposeServiceStatus>()

      for (const container of containers) {
        const serviceLabel = container.labels['com.docker.compose.service']
        if (serviceLabel) {
          const existing = servicesMap.get(serviceLabel)
          if (existing) {
            // 如果服务已有容器，保留运行中的容器
            if (container.state === 'running' && existing.state !== 'running') {
              servicesMap.set(serviceLabel, {
                name: serviceLabel,
                state: container.state,
                containerId: container.id,
                ports: container.ports
              })
            }
          } else {
            servicesMap.set(serviceLabel, {
              name: serviceLabel,
              state: container.state,
              containerId: container.id,
              ports: container.ports
            })
          }
        }
      }

      const status: ComposeProjectStatus = {
        projectName,
        services: Array.from(servicesMap.values())
      }

      return { success: true, status }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 Compose 项目状态失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 在 Compose 服务中执行命令
   * @param projectName Compose 项目名称
   * @param serviceName 服务名称
   * @param command 要执行的命令
   * @param options 执行选项
   * @returns 执行结果
   */
  async composeExec(
    projectName: string,
    serviceName: string,
    command: string,
    options?: ComposeExecOptions
  ): Promise<ComposeExecResult> {
    this.ensureInitialized()

    try {
      // 查找服务对应的容器
      const containers = await this.getContainersByComposeProject(projectName)
      const targetContainer = containers.find(
        (c) => c.labels['com.docker.compose.service'] === serviceName && c.state === 'running'
      )

      if (!targetContainer) {
        return { success: false, error: `服务 ${serviceName} 没有运行中的容器` }
      }

      const execResult = await this.execCommand(targetContainer.id, {
        command,
        workdir: options?.workdir,
        env: options?.env,
        timeout: options?.timeout
      })

      if (!execResult) {
        return { success: false, error: '命令执行失败' }
      }

      return { success: true, result: execResult }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('在 Compose 服务中执行命令失败', 'main', {
        error: errorMessage,
        projectName,
        serviceName
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 获取 Compose 项目日志
   * @param projectName Compose 项目名称
   * @param options 日志选项
   * @returns 日志结果
   */
  async composeLogs(
    projectName: string,
    options?: ComposeLogOptions
  ): Promise<ComposeLogResult> {
    this.ensureInitialized()

    try {
      let containers = await this.getContainersByComposeProject(projectName)

      // 如果指定了服务名称，过滤容器
      if (options?.service) {
        containers = containers.filter(
          (c) => c.labels['com.docker.compose.service'] === options.service
        )
      }

      if (containers.length === 0) {
        return { success: true, logs: '' }
      }

      // 合并所有容器的日志
      const allLogs: string[] = []

      for (const container of containers) {
        const serviceName = container.labels['com.docker.compose.service'] || 'unknown'
        const logs = await this.getContainerLogs(container.id, {
          tail: options?.tail,
          since: options?.since,
          until: options?.until
        })

        // 为每行日志添加服务名前缀
        const lines = logs.split('\n').filter(Boolean)
        for (const line of lines) {
          allLogs.push(`[${serviceName}] ${line}`)
        }
      }

      return { success: true, logs: allLogs.join('\n') }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 Compose 项目日志失败', 'main', {
        error: errorMessage,
        projectName
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 执行 docker-compose down 命令（扩展版）
   * @param projectName Compose 项目名称
   * @param options down 选项
   * @returns 操作结果
   */
  async composeDownExtended(
    projectName: string,
    options?: ComposeDownOptions
  ): Promise<ComposeDownResult> {
    this.ensureInitialized()

    try {
      // 先获取项目容器列表，用于返回删除的容器 ID
      const containers = await this.getContainersByComposeProject(projectName)
      const containerIds = containers.map((c) => c.id)

      // 构建 docker compose down 命令
      const cmdParts = ['docker', 'compose', '-p', `"${projectName}"`, 'down']

      if (options?.removeVolumes) {
        cmdParts.push('-v')
      }

      if (options?.removeOrphans) {
        cmdParts.push('--remove-orphans')
      }

      if (options?.force) {
        // 使用 -R 或 --timeout 0 强制删除
        cmdParts.push('-t', '0')
      }

      const command = cmdParts.join(' ')

      const { stdout, stderr } = await execAsync(command, {
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 10
      })

      logger.info('Docker Compose down 成功', 'main', {
        projectName,
        stdout: stdout.substring(0, 500)
      })

      if (stderr) {
        logger.warn('Docker Compose down 有警告输出', 'main', {
          projectName,
          stderr: stderr.substring(0, 200)
        })
      }

      // 尝试解析删除的卷（从输出中提取）
      const removedVolumes: string[] = []
      const volumeMatches = stdout.match(/Volume\s+(\S+)\s+/g) || []
      for (const match of volumeMatches) {
        const volumeName = match.replace(/Volume\s+(\S+)\s+/, '$1')
        removedVolumes.push(volumeName)
      }

      return {
        success: true,
        removedContainerIds: containerIds,
        removedVolumes
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Docker Compose down 失败', 'main', { error: errorMessage, projectName })
      return { success: false, error: errorMessage }
    }
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
  composeStop: (projectName: string, options?: ComposeStopOptions) =>
    getDockerService().composeStop(projectName, options),
  composeRestart: (projectName: string) => getDockerService().composeRestart(projectName),
  composeStatus: (projectName: string) => getDockerService().composeStatus(projectName),
  composeExec: (
    projectName: string,
    serviceName: string,
    command: string,
    options?: ComposeExecOptions
  ) => getDockerService().composeExec(projectName, serviceName, command, options),
  composeLogs: (projectName: string, options?: ComposeLogOptions) =>
    getDockerService().composeLogs(projectName, options),
  composeDownExtended: (projectName: string, options?: ComposeDownOptions) =>
    getDockerService().composeDownExtended(projectName, options),
  composeUp: (options: {
    composeContent: string
    projectName: string
    workingDir?: string
    dockerfileConfigs?: Array<{
      id: string
      content: string
      targetContext: string
      targetFilename: string
    }>
  }) => getDockerService().composeUp(options),
  inspectImage: (imageId: string) => getDockerService().inspectImage(imageId),
  buildImageFromDockerfile: (options: {
    dockerfile: string
    context?: string
    tag?: string
    buildArgs?: Record<string, string>
  }) => getDockerService().buildImageFromDockerfile(options),
  createContainerFromImage: (options: {
    imageId: string
    name?: string
    env?: string[]
    ports?: Array<{ containerPort: number; hostPort?: number; protocol?: 'tcp' | 'udp' }>
    volumes?: Array<{ source: string; destination: string; mode?: 'rw' | 'ro' }>
    workingDir?: string
    cmd?: string[]
  }) => getDockerService().createContainerFromImage(options),
  execCommand: (id: string, cmd: ExecCommand) => getDockerService().execCommand(id, cmd),
  getContainerLogs: (id: string, opts?: LogOptions) =>
    getDockerService().getContainerLogs(id, opts),
  copyToContainer: (id: string, src: string, dest: string) =>
    getDockerService().copyToContainer(id, src, dest),
  copyFromContainer: (id: string, src: string, dest: string) =>
    getDockerService().copyFromContainer(id, src, dest),
  cleanupDanglingResources: () => getDockerService().cleanupDanglingResources()
}
