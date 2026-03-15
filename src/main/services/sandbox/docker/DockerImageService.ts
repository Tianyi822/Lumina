import Docker from 'dockerode'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { logger } from '@main/services/logger'
import type {
  BuildImageFromDockerfileOptions,
  BuildImageFromDockerfileResult,
  CreateContainerFromImageOptions,
  CreateContainerFromImageResult,
  DockerServiceContext
} from './types'

/**
 * Docker 镜像与镜像派生容器服务
 */
export class DockerImageService {
  constructor(private readonly context: DockerServiceContext) {}

  /**
   * 从 Dockerfile 构建镜像
   * @param options 构建参数
   * @returns 构建结果
   */
  async buildImageFromDockerfile(
    options: BuildImageFromDockerfileOptions
  ): Promise<BuildImageFromDockerfileResult> {
    const buildLogChunks: string[] = []

    try {
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'docker-build-'))

      try {
        const dockerfilePath = path.join(tempDir, 'Dockerfile')
        await fs.promises.writeFile(dockerfilePath, options.dockerfile, 'utf-8')

        if (options.context) {
          const contextPath = path.resolve(options.context)
          const contextStat = await fs.promises.stat(contextPath)

          if (contextStat.isDirectory()) {
            const files = await fs.promises.readdir(contextPath)
            await Promise.all(
              files.map(async (file) => {
                const srcPath = path.join(contextPath, file)
                const destPath = path.join(tempDir, file)
                await fs.promises.copyFile(srcPath, destPath)
              })
            )
          } else {
            const destPath = path.join(tempDir, path.basename(contextPath))
            await fs.promises.copyFile(contextPath, destPath)
          }
        }

        const buildOpts: Docker.ImageBuildOptions = {
          dockerfile: 'Dockerfile',
          t: options.tag || 'sparrow-manus-built'
        }

        if (options.buildArgs && Object.keys(options.buildArgs).length > 0) {
          buildOpts.buildargs = options.buildArgs
        }

        logger.info('开始构建 Docker 镜像', 'main', { tag: options.tag })

        return await new Promise((resolve) => {
          this.context.getDocker().buildImage(
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

                    if (json.aux?.Digest) {
                      logger.info('构建摘要', 'main', { digest: json.aux.Digest })
                    }
                  } catch {
                    buildLogChunks.push(line)
                  }
                }
              })

              buildStream.on('end', () => {
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

                logger.info('构建流结束，开始查找镜像', 'main', { tag: options.tag })

                this.context
                  .getDocker()
                  .listImages()
                  .then((images) => {
                    logger.debug('获取到镜像列表', 'main', { count: images.length })

                    const targetTag = `${options.tag}:latest`
                    const builtImage = images.find((image) => {
                      if (!options.tag || !image.RepoTags) {
                        return false
                      }

                      const hasTag = image.RepoTags.some(
                        (tag) => tag === targetTag || tag === options.tag
                      )

                      if (hasTag) {
                        logger.debug('找到匹配的镜像', 'main', {
                          id: image.Id.substring(0, 12),
                          tags: image.RepoTags
                        })
                      }

                      return hasTag
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
                      return
                    }

                    const recentImages = images
                      .filter(
                        (image) => image.RepoTags && !image.RepoTags.includes('<none>:<none>')
                      )
                      .slice(0, 5)
                      .map((image) => ({ id: image.Id.substring(0, 12), tags: image.RepoTags }))

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

              buildStream.on('error', (streamError: Error) => {
                logger.error('构建 Docker 镜像失败', 'main', { error: streamError.message })
                resolve({
                  success: false,
                  error: streamError.message,
                  buildLog: buildLogChunks.join('\n')
                })
              })
            }
          )
        })
      } finally {
        try {
          await fs.promises.rm(tempDir, { recursive: true, force: true })
        } catch (error) {
          logger.warn('清理临时目录失败', 'main', { error })
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
   * 获取镜像详情
   * @param imageId 镜像 ID
   * @returns 镜像信息
   */
  async inspectImage(imageId: string): Promise<Docker.ImageInspectInfo | null> {
    try {
      const image = this.context.getDocker().getImage(imageId)
      return await image.inspect()
    } catch (error) {
      logger.error('获取镜像信息失败', 'main', { imageId, error: String(error) })
      return null
    }
  }

  /**
   * 从镜像创建并启动容器
   * @param options 创建选项
   * @returns 创建结果
   */
  async createContainerFromImage(
    options: CreateContainerFromImageOptions
  ): Promise<CreateContainerFromImageResult> {
    try {
      const portBindings: Record<string, Array<{ HostPort?: string; HostIp?: string }>> = {}
      const exposedPorts: Record<string, object> = {}

      if (options.ports) {
        for (const port of options.ports) {
          const portKey = `${port.containerPort}/${port.protocol || 'tcp'}`
          exposedPorts[portKey] = {}

          if (port.hostPort !== undefined) {
            portBindings[portKey] = [{ HostPort: String(port.hostPort), HostIp: '0.0.0.0' }]
          } else {
            portBindings[portKey] = [{ HostIp: '0.0.0.0' }]
          }
        }
      }

      const binds: string[] = []
      if (options.volumes) {
        for (const volume of options.volumes) {
          const mode = volume.mode || 'rw'
          binds.push(`${volume.source}:${volume.destination}:${mode}`)
        }
      }

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

      const container = await this.context.getDocker().createContainer(containerConfig)
      await container.start()

      logger.info('容器创建并启动成功', 'main', {
        containerId: container.id.substring(0, 12),
        name: options.name
      })

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
   * 清理悬空镜像和匿名容器
   */
  async cleanupDanglingResources(): Promise<void> {
    try {
      const docker = this.context.getDocker()
      const images = await docker.listImages({ filters: { dangling: ['true'] } })

      for (const image of images) {
        try {
          await docker.getImage(image.Id).remove({ force: true })
          logger.info('已清理悬空镜像', 'main', { imageId: image.Id.substring(0, 12) })
        } catch {
          // 忽略清理失败
        }
      }

      const containers = await docker.listContainers({ all: true })

      for (const containerInfo of containers) {
        if (
          containerInfo.State === 'exited' &&
          containerInfo.Names.some(
            (name) => name.startsWith('/') && name.length > 12 && !name.includes('sandbox-')
          )
        ) {
          const name = containerInfo.Names[0].replace('/', '')
          const isAutoGenerated = /^[a-z]+_[a-z]+$/i.test(name)

          if (isAutoGenerated) {
            try {
              await docker.getContainer(containerInfo.Id).remove({ force: true })
              logger.info('已清理匿名容器', 'main', {
                containerId: containerInfo.Id.substring(0, 12),
                name
              })
            } catch {
              // 忽略清理失败
            }
          }
        }
      }
    } catch (error) {
      logger.error('清理资源失败', 'main', { error: String(error) })
    }
  }
}
