/**
 * Docker 配置文件解析工具
 * 用于解析 Dockerfile 和 docker-compose.yaml 中的镜像和端口信息
 */

/**
 * 从 Dockerfile 内容中解析基础镜像
 * @param dockerfileContent Dockerfile 内容
 * @returns 基础镜像列表（可能有多个 FROM 语句）
 */
export function parseDockerfileImages(dockerfileContent: string): string[] {
  const images: string[] = []
  const lines = dockerfileContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // 匹配 FROM 语句，支持 FROM image:tag 和 FROM image:tag AS name 格式
    const match = trimmed.match(/^FROM\s+([^\s]+)(?:\s+AS\s+\S+)?/i)
    if (match && match[1]) {
      const image = match[1]
      // 排除 scratch 和构建阶段引用（以 --from= 开头的）
      if (image.toLowerCase() !== 'scratch' && !image.startsWith('$')) {
        images.push(image)
      }
    }
  }

  return images
}

/**
 * 从 docker-compose.yaml 内容中解析镜像
 * @param composeContent docker-compose.yaml 内容
 * @returns 镜像列表
 */
export function parseComposeImages(composeContent: string): string[] {
  const images: string[] = []
  const lines = composeContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // 匹配 image: xxx 格式
    const match = trimmed.match(/^image:\s*["']?([^"'\s]+)["']?/i)
    if (match && match[1]) {
      images.push(match[1])
    }
  }

  return images
}

/**
 * 从 Dockerfile 内容中解析 EXPOSE 指令暴露的端口
 * @param dockerfileContent Dockerfile 内容
 * @returns 端口列表
 */
export function parseDockerfileExposedPorts(
  dockerfileContent: string
): Array<{ containerPort: number; protocol: 'tcp' | 'udp' }> {
  const ports: Array<{ containerPort: number; protocol: 'tcp' | 'udp' }> = []
  const lines = dockerfileContent.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // 匹配 EXPOSE 指令（忽略大小写）
    if (trimmed.toUpperCase().startsWith('EXPOSE')) {
      const exposeContent = trimmed.slice(6).trim()
      // 支持多种格式: EXPOSE 3306, EXPOSE 3306/tcp, EXPOSE 3306 3307
      const portStrings = exposeContent.split(/\s+/)

      for (const portStr of portStrings) {
        const match = portStr.match(/^(\d+)(?:\/(tcp|udp))?$/i)
        if (match) {
          const containerPort = parseInt(match[1], 10)
          if (containerPort >= 1 && containerPort <= 65535) {
            ports.push({
              containerPort,
              protocol: (match[2]?.toLowerCase() as 'tcp' | 'udp') || 'tcp'
            })
          }
        }
      }
    }
  }

  return ports
}
