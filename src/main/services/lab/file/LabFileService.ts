import { promises as fs } from 'fs'
import { dirname, join, normalize, relative } from 'path'
import { logger } from '@main/services/logger'
import type { FileWriteRequest, FileWriteResult } from '@shared/types/lab'
import { labService } from '../LabService'
import { getDockerService } from '../docker/DockerService'
import {
  getLabFileTempRoot,
  isPathInTempRoot,
  normalizeProjectFilePath,
  normalizeProjectRoot
} from './filePaths'

const dockerService = getDockerService()

interface NormalizedFileWriteRequest {
  path: string
  content: string
}

interface TarEntry {
  path: string
  type: 'file' | 'directory'
  mode: number
  mtime: number
  content?: Buffer
}

/**
 * 实验室文件服务
 * 负责将项目文件批量写入实验室容器
 */
export class LabFileService {
  /**
   * 批量写入项目文件到容器
   */
  async writeProjectFiles(
    labId: string,
    files: FileWriteRequest[],
    projectRoot?: string
  ): Promise<FileWriteResult> {
    const normalizedProjectRoot = normalizeProjectRoot(projectRoot)
    if (!normalizedProjectRoot) {
      return {
        success: false,
        writtenCount: 0,
        error: '项目根目录不在允许范围内'
      }
    }

    const validationResult = this.validateFileRequests(files)
    if (!validationResult.success) {
      return {
        success: false,
        writtenCount: 0,
        failedFiles: validationResult.failedFiles,
        error: validationResult.error
      }
    }

    const lab = labService.loadLab(labId)
    if (!lab) {
      return { success: false, writtenCount: 0, error: '实验室不存在' }
    }

    const containerId = lab.primaryContainerId || lab.containerIds[0]
    if (!containerId) {
      return { success: false, writtenCount: 0, error: '实验室没有关联容器' }
    }

    const details = await dockerService.getContainerDetails(containerId)
    if (!details || details.state !== 'running') {
      return { success: false, writtenCount: 0, error: '容器未运行' }
    }

    let tempDir: string | null = null

    try {
      await fs.mkdir(getLabFileTempRoot(), { recursive: true })
      tempDir = await fs.mkdtemp(join(getLabFileTempRoot(), `${labId}-`))

      await this.writeFilesToTempDir(tempDir, validationResult.files)
      const archive = await this.createTarArchive(tempDir)

      const container = dockerService.getDocker().getContainer(containerId)
      await container.putArchive(archive, { path: normalizedProjectRoot })

      logger.info('批量写入项目文件成功', 'main', {
        labId,
        containerId: containerId.substring(0, 12),
        projectRoot: normalizedProjectRoot,
        writtenCount: validationResult.files.length
      })

      return {
        success: true,
        writtenCount: validationResult.files.length
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('批量写入项目文件失败', 'main', {
        labId,
        containerId,
        projectRoot: normalizedProjectRoot,
        error: errorMessage
      })

      return {
        success: false,
        writtenCount: 0,
        failedFiles: validationResult.files.map((file) => file.path),
        error: `文件写入失败: ${errorMessage}`
      }
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch((cleanupError: unknown) => {
          logger.warn('清理临时项目目录失败', 'main', {
            labId,
            tempDir,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          })
        })
      }
    }
  }

  /**
   * 校验并规范化文件写入请求
   */
  private validateFileRequests(
    files: FileWriteRequest[]
  ):
    | { success: true; files: NormalizedFileWriteRequest[] }
    | { success: false; error: string; failedFiles: string[] } {
    if (!Array.isArray(files) || files.length === 0) {
      return {
        success: false,
        error: '文件列表不能为空',
        failedFiles: []
      }
    }

    const normalizedFiles: NormalizedFileWriteRequest[] = []
    const failedFiles: string[] = []
    const usedPaths = new Set<string>()

    for (const file of files) {
      const normalizedPath = normalizeProjectFilePath(file.path)

      if (!normalizedPath) {
        failedFiles.push(file.path)
        continue
      }

      if (usedPaths.has(normalizedPath)) {
        failedFiles.push(file.path)
        continue
      }

      usedPaths.add(normalizedPath)
      normalizedFiles.push({
        path: normalizedPath,
        content: file.content
      })
    }

    if (failedFiles.length > 0) {
      return {
        success: false,
        error: '文件路径不合法或存在重复路径',
        failedFiles
      }
    }

    return {
      success: true,
      files: normalizedFiles
    }
  }

  /**
   * 将文件内容写入本地临时目录
   */
  private async writeFilesToTempDir(
    tempDir: string,
    files: NormalizedFileWriteRequest[]
  ): Promise<void> {
    for (const file of files) {
      const targetPath = normalize(join(tempDir, file.path))
      if (!isPathInTempRoot(tempDir, targetPath)) {
        throw new Error(`检测到不安全的目标路径: ${file.path}`)
      }

      await fs.mkdir(dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, file.content, 'utf-8')
    }
  }

  /**
   * 生成 tar archive，供 Docker putArchive 使用
   */
  private async createTarArchive(sourceDir: string): Promise<Buffer> {
    const entries = await this.collectTarEntries(sourceDir, sourceDir)
    const chunks: Buffer[] = []

    for (const entry of entries) {
      chunks.push(this.createTarHeader(entry))

      if (entry.type === 'file' && entry.content) {
        chunks.push(entry.content)

        const paddingSize = (512 - (entry.content.length % 512)) % 512
        if (paddingSize > 0) {
          chunks.push(Buffer.alloc(paddingSize))
        }
      }
    }

    chunks.push(Buffer.alloc(1024))
    return Buffer.concat(chunks)
  }

  /**
   * 收集 tar 所需的目录和文件条目
   */
  private async collectTarEntries(currentDir: string, baseDir: string): Promise<TarEntry[]> {
    const dirents = await fs.readdir(currentDir, { withFileTypes: true })
    dirents.sort((a, b) => a.name.localeCompare(b.name))

    const entries: TarEntry[] = []

    for (const dirent of dirents) {
      const absolutePath = join(currentDir, dirent.name)
      const relativePath = relative(baseDir, absolutePath).replace(/\\/g, '/')
      const stats = await fs.stat(absolutePath)
      const mode = stats.mode & 0o777
      const mtime = Math.floor(stats.mtimeMs / 1000)

      if (dirent.isDirectory()) {
        entries.push({
          path: `${relativePath}/`,
          type: 'directory',
          mode,
          mtime
        })
        entries.push(...(await this.collectTarEntries(absolutePath, baseDir)))
        continue
      }

      if (dirent.isFile()) {
        entries.push({
          path: relativePath,
          type: 'file',
          mode,
          mtime,
          content: await fs.readFile(absolutePath)
        })
      }
    }

    return entries
  }

  /**
   * 创建单个 tar 头部
   */
  private createTarHeader(entry: TarEntry): Buffer {
    const header = Buffer.alloc(512, 0)
    const { name, prefix } = this.splitTarPath(entry.path)
    const size = entry.type === 'file' ? entry.content?.length || 0 : 0

    this.writeTarString(header, name, 0, 100)
    this.writeTarOctal(header, entry.mode || (entry.type === 'directory' ? 0o755 : 0o644), 100, 8)
    this.writeTarOctal(header, 0, 108, 8)
    this.writeTarOctal(header, 0, 116, 8)
    this.writeTarOctal(header, size, 124, 12)
    this.writeTarOctal(header, entry.mtime, 136, 12)

    header.fill(0x20, 148, 156)
    header[156] = entry.type === 'directory' ? '5'.charCodeAt(0) : '0'.charCodeAt(0)

    this.writeTarString(header, 'ustar', 257, 6)
    this.writeTarString(header, '00', 263, 2)
    this.writeTarString(header, 'root', 265, 32)
    this.writeTarString(header, 'root', 297, 32)

    if (prefix) {
      this.writeTarString(header, prefix, 345, 155)
    }

    const checksum = header.reduce((sum, value) => sum + value, 0)
    this.writeTarChecksum(header, checksum)

    return header
  }

  /**
   * 按 tar 规范拆分路径
   */
  private splitTarPath(filePath: string): { name: string; prefix?: string } {
    if (Buffer.byteLength(filePath) <= 100) {
      return { name: filePath }
    }

    const isDirectory = filePath.endsWith('/')
    const trimmedPath = isDirectory ? filePath.slice(0, -1) : filePath
    const segments = trimmedPath.split('/')
    const fileName = segments.pop()

    if (!fileName) {
      throw new Error(`无法创建 tar 条目路径: ${filePath}`)
    }

    const name = isDirectory ? `${fileName}/` : fileName
    const prefix = segments.join('/')

    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
      throw new Error(`tar 条目路径过长: ${filePath}`)
    }

    return { name, prefix }
  }

  /**
   * 写入 tar 字符串字段
   */
  private writeTarString(buffer: Buffer, value: string, offset: number, length: number): void {
    buffer.write(value, offset, Math.min(length, Buffer.byteLength(value)), 'utf-8')
  }

  /**
   * 写入 tar 八进制字段
   */
  private writeTarOctal(buffer: Buffer, value: number, offset: number, length: number): void {
    const octal = Math.max(0, Math.floor(value)).toString(8)
    const padded = octal.padStart(length - 1, '0')
    buffer.write(`${padded}\0`, offset, length, 'ascii')
  }

  /**
   * 写入 tar 校验和字段
   */
  private writeTarChecksum(buffer: Buffer, checksum: number): void {
    const padded = checksum.toString(8).padStart(6, '0')
    buffer.write(`${padded}\0 `, 148, 8, 'ascii')
  }
}
