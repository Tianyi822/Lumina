import Docker from 'dockerode'

export interface DockerServiceContext {
  getDocker(): Docker
}

export interface DockerAvailabilityResult {
  available: boolean
  version?: string
  error?: string
}

export interface DockerfileConfigPayload {
  id: string
  content: string
  targetContext: string
  targetFilename: string
}

export interface BuildImageFromDockerfileOptions {
  dockerfile: string
  context?: string
  tag?: string
  buildArgs?: Record<string, string>
  /** 是否禁止拉取基础镜像，强制使用本地缓存 */
  noPull?: boolean
}

export interface BuildImageFromDockerfileResult {
  success: boolean
  imageId?: string
  error?: string
  buildLog?: string
}

export interface CreateContainerFromImageOptions {
  imageId: string
  name?: string
  env?: string[]
  ports?: Array<{ containerPort: number; hostPort?: number; protocol?: 'tcp' | 'udp' }>
  volumes?: Array<{ source: string; destination: string; mode?: 'rw' | 'ro' }>
  workingDir?: string
  cmd?: string[]
}

export interface CreateContainerFromImageResult {
  success: boolean
  containerId?: string
  error?: string
}

export interface DockerVolumeInfo {
  name: string
  driver?: string
  labels?: Record<string, string>
  mountpoint?: string
  createdAt?: string
  scope?: string
}

export interface DockerVolumeCreateOptions {
  name: string
  driver?: string
  labels?: Record<string, string>
}

export interface DockerVolumeRemoveOptions {
  force?: boolean
}

export interface ComposeBuildContext {
  service: string
  context: string
  dockerfile?: string
}

export interface ComposeUpOptions {
  composeContent: string
  projectName: string
  workingDir?: string
  dockerfileConfigs?: DockerfileConfigPayload[]
  /** 是否禁止拉取镜像，强制使用本地缓存 */
  noPull?: boolean
}

export interface ComposeUpResult {
  success: boolean
  containerIds?: string[]
  error?: string
  upLog?: string
}

export type DockerContainerInfo = Awaited<ReturnType<Docker['listContainers']>>[number]
export type DockerContainerInspect = Awaited<
  ReturnType<ReturnType<Docker['getContainer']>['inspect']>
>

export function serialize<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (typeof value === 'bigint') {
        return Number(value)
      }
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
