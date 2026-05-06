import type {
  ContainerInfo,
  ContainerState,
  HostConfig,
  MountPoint,
  NetworkInfo,
  NetworkSettings,
  PortMapping
} from '@shared/types/lab'
import type { DockerContainerInfo, DockerContainerInspect, DockerServiceContext } from './types'
import { serialize } from './types'

/**
 * Docker 容器数据映射器
 */
export class DockerContainerMapper {
  private readonly context: DockerServiceContext

  constructor(context: DockerServiceContext) {
    this.context = context
  }

  /**
   * 获取容器基础信息
   * @param containerId 容器 ID
   * @returns 容器基础信息
   */
  async getContainerBaseInfo(containerId: string): Promise<ContainerInfo> {
    const containers = await this.context.getDocker().listContainers({ all: true })
    const found = containers.find((c) => c.Id === containerId || c.Id.startsWith(containerId))

    if (!found) {
      throw new Error(`容器不存在: ${containerId}`)
    }

    return this.mapContainerInfo(found)
  }

  /**
   * 映射容器基础信息
   * @param container 容器原始数据
   * @returns 标准化后的容器信息
   */
  mapContainerInfo(container: DockerContainerInfo): ContainerInfo {
    const ports: PortMapping[] = []

    if (container.Ports) {
      for (const port of container.Ports) {
        ports.push({
          hostPort: port.PublicPort,
          containerPort: port.PrivatePort,
          protocol: (port.Type as 'tcp' | 'udp') || 'tcp'
        })
      }
    }

    return serialize({
      id: container.Id,
      shortId: container.Id.substring(0, 12),
      names: container.Names?.map((name) => name.replace(/^\//, '')) || [],
      image: container.Image || 'unknown',
      state: this.mapState(container.State),
      status: container.Status || '',
      ports,
      created: container.Created,
      labels: container.Labels || {}
    })
  }

  /**
   * 映射容器状态
   * @param state Docker 原始状态
   * @returns 标准化状态
   */
  mapState(state: string): ContainerState {
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

  /**
   * 映射主机配置
   * @param info 容器 inspect 结果
   * @returns 主机配置
   */
  mapHostConfig(info: DockerContainerInspect): HostConfig {
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

  /**
   * 映射网络配置
   * @param info 容器 inspect 结果
   * @returns 网络配置
   */
  mapNetworkSettings(info: DockerContainerInspect): NetworkSettings {
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

    for (const [name, network] of Object.entries(netSettings)) {
      networks[name] = {
        networkId: network.NetworkID || '',
        ipAddress: network.IPAddress || '',
        gateway: network.Gateway || '',
        macAddress: network.MacAddress || ''
      }
    }

    const ports: Record<string, { hostIp: string; hostPort: string }[]> = {}
    const portBindings = (info.NetworkSettings?.Ports || {}) as Record<
      string,
      { HostIp?: string; HostPort?: string }[] | null
    >

    for (const [containerPort, bindings] of Object.entries(portBindings)) {
      if (bindings) {
        ports[containerPort] = bindings.map((binding) => ({
          hostIp: binding.HostIp || '0.0.0.0',
          hostPort: binding.HostPort || ''
        }))
      }
    }

    return { networks, ports }
  }

  /**
   * 映射挂载点
   * @param info 容器 inspect 结果
   * @returns 挂载点列表
   */
  mapMounts(info: DockerContainerInspect): MountPoint[] {
    const mounts: MountPoint[] = []
    const infoMounts = info.Mounts as
      | Array<{
          Type?: string
          Source?: string
          Destination?: string
          RW?: boolean
        }>
      | undefined

    if (!infoMounts) {
      return mounts
    }

    for (const mount of infoMounts) {
      mounts.push({
        type: (mount.Type as 'bind' | 'volume' | 'tmpfs') || 'bind',
        source: mount.Source || '',
        destination: mount.Destination || '',
        mode: mount.RW ? 'rw' : 'ro'
      })
    }

    return mounts
  }
}
