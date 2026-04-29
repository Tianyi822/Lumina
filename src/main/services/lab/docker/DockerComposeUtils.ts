import * as fs from 'fs'
import * as path from 'path'
import { logger } from '@main/services/logger'
import type { ComposeBuildContext } from './types'

/**
 * 去除 docker-compose.yaml 中的重复服务定义
 * 只保留每个服务的最后一次定义
 * @param content compose 文件内容
 * @returns 清理后的内容
 */
export function deduplicateServices(content: string): string {
  const lines = content.split('\n')

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
    return content
  }

  const serviceIndent = servicesIndent + 2
  const serviceOccurrences: Map<string, Array<{ start: number; end: number }>> = new Map()

  let currentService: string | null = null
  let serviceStart = -1

  for (let i = servicesLineIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    const lineIndent = line.search(/\S/)

    if (lineIndent <= servicesIndent && lineIndent !== -1) {
      if (currentService && serviceStart >= 0) {
        const occurrences = serviceOccurrences.get(currentService) || []
        occurrences.push({ start: serviceStart, end: i })
        serviceOccurrences.set(currentService, occurrences)
      }
      currentService = null
      break
    }

    if (lineIndent === serviceIndent) {
      if (currentService && serviceStart >= 0) {
        const occurrences = serviceOccurrences.get(currentService) || []
        occurrences.push({ start: serviceStart, end: i })
        serviceOccurrences.set(currentService, occurrences)
      }

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

  if (currentService && serviceStart >= 0) {
    const occurrences = serviceOccurrences.get(currentService) || []
    occurrences.push({ start: serviceStart, end: lines.length })
    serviceOccurrences.set(currentService, occurrences)
  }

  const skipRanges: Array<{ start: number; end: number }> = []
  let hasDuplicates = false

  for (const [serviceName, occurrences] of serviceOccurrences) {
    if (occurrences.length > 1) {
      hasDuplicates = true
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

  if (!hasDuplicates) {
    return content
  }

  skipRanges.sort((a, b) => a.start - b.start)

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
 * @param content compose 文件内容
 * @returns 构建上下文
 */
export function parseBuildContexts(content: string): ComposeBuildContext[] {
  const contexts: ComposeBuildContext[] = []
  const lines = content.split('\n')

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

    if (!trimmed) {
      continue
    }

    const lineIndent = line.search(/\S/)

    if (lineIndent <= servicesIndent && lineIndent !== -1) {
      break
    }

    if (lineIndent === serviceIndent) {
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

    if (!currentService || lineIndent <= serviceIndent) {
      continue
    }

    const relativeIndent = lineIndent - serviceIndent
    const buildShorthandMatch = trimmed.match(/^build:\s*(\S+)\s*$/)

    if (buildShorthandMatch && relativeIndent === 2) {
      const buildValue = buildShorthandMatch[1].trim()
      if (buildValue.startsWith('.')) {
        currentContext = buildValue
        inBuildBlock = false
        buildBlockIndent = -1
      } else {
        const nextLine = lines[i + 1]
        if (nextLine) {
          const nextIndent = nextLine.search(/\S/)
          if (nextIndent > lineIndent) {
            inBuildBlock = true
            buildBlockIndent = lineIndent
          } else {
            currentContext = buildValue
          }
        }
      }
      continue
    }

    if (trimmed === 'build:' && relativeIndent === 2) {
      inBuildBlock = true
      buildBlockIndent = lineIndent
      continue
    }

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

    if (inBuildBlock && lineIndent <= buildBlockIndent) {
      inBuildBlock = false
    }
  }

  if (currentService && currentContext) {
    contexts.push({
      service: currentService,
      context: currentContext,
      dockerfile: currentDockerfile
    })
  }

  logger.info('解析到构建上下文配置', 'main', {
    count: contexts.length,
    contexts: contexts.map((context) => ({
      service: context.service,
      context: context.context
    }))
  })

  return contexts
}

/**
 * 根据服务名推断默认基础镜像
 * @param serviceName 服务名称
 * @returns 默认镜像
 */
export function inferBaseImage(serviceName: string): string {
  const name = serviceName.toLowerCase()

  const imageMap: Record<string, string> = {
    mysql: 'mysql:latest',
    mariadb: 'mariadb:latest',
    postgres: 'postgres:latest',
    postgresql: 'postgres:latest',
    redis: 'redis:latest',
    mongo: 'mongo:latest',
    mongodb: 'mongo:latest',
    nginx: 'nginx:latest',
    apache: 'httpd:latest',
    node: 'node:latest',
    python: 'python:latest',
    java: 'openjdk:latest',
    go: 'golang:latest',
    php: 'php:latest',
    ruby: 'ruby:latest'
  }

  for (const [key, image] of Object.entries(imageMap)) {
    if (name.includes(key)) {
      return image
    }
  }

  return 'alpine:latest'
}

/**
 * 递归复制目录
 * @param src 源目录
 * @param dest 目标目录
 */
export async function copyDirectory(src: string, dest: string): Promise<void> {
  await fs.promises.mkdir(dest, { recursive: true })
  const entries = await fs.promises.readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath)
    } else {
      await fs.promises.copyFile(srcPath, destPath)
    }
  }
}
