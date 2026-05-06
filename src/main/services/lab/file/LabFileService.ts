import { promises as fs, createWriteStream } from 'fs'
import { dirname, join, normalize, relative } from 'path'
import { logger } from '@main/services/logger'
import type { FileWriteEntryResult, FileWriteRequest, FileWriteResult } from '@shared/types/lab'
import { labService } from '../LabService'
import { getDockerService } from '../docker/DockerService'
import {
  getLabFileTempRoot,
  isPathInTempRoot,
  normalizeProjectFilePath,
  normalizeProjectRoot
} from './filePaths'
import {
  buildTarArchive,
  createTarArchiveStream,
  getTarArchiveSize,
  type TarEntry
} from './tarBuilder'

const dockerService = getDockerService()

interface NormalizedFileWriteRequest {
  path: string
  content: string
}

interface MemoryTarArchiveEntries {
  entries: TarEntry[]
  totalContentBytes: number
}

/** 单文件大小阈值（1MB），超过此值使用流式写入 */
const LARGE_FILE_THRESHOLD = 1024 * 1024

/**
 * 实验室文件服务
 * 负责将项目文件批量写入实验室容器
 */
export class LabFileService {
  /** 并发写入文件数 */
  static writeConcurrency = 8

  /** 是否从内存直接构建 tar（跳过临时目录 I/O） */
  static buildTarFromMemory = true

  /**
   * 分批并发执行异步任务
   */
  private static async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency)
      await Promise.all(batch.map(fn))
    }
  }

  /**
   * 批量写入项目文件到容器
   */
  async writeProjectFiles(
    labId: string,
    files: FileWriteRequest[],
    projectRoot?: string,
    onProgress?: (message: string) => void
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

    const totalCount = validationResult.files.length
    const totalStartTime = Date.now()
    const reportProgress = (msg: string): void => {
      logger.info(msg, 'main', { labId, containerId: containerId.substring(0, 12) })
      onProgress?.(msg)
    }

    let tempDir: string | null = null

    try {
      let archive: Buffer | NodeJS.ReadableStream
      let archiveSizeBytes = 0
      let totalContentBytes = 0
      let tarPrepareDurationMs = 0

      if (LabFileService.buildTarFromMemory) {
        const tarPrepareStartTime = Date.now()
        reportProgress(`开始准备 tar 流（${totalCount} 个文件）...`)
        const archiveEntries = this.createTarEntriesFromMemory(
          validationResult.files,
          reportProgress
        )
        archive = createTarArchiveStream(archiveEntries.entries)
        archiveSizeBytes = getTarArchiveSize(archiveEntries.entries)
        totalContentBytes = archiveEntries.totalContentBytes
        tarPrepareDurationMs = Date.now() - tarPrepareStartTime
        reportProgress(`tar 流准备完成，正准备上传到容器...`)
      } else {
        await fs.mkdir(getLabFileTempRoot(), { recursive: true })
        tempDir = await fs.mkdtemp(join(getLabFileTempRoot(), `${labId}-`))
        reportProgress(
          `临时目录已创建，开始写入 ${totalCount} 个文件（并发数: ${LabFileService.writeConcurrency}）...`
        )

        const writeResults = await this.writeFilesToTempDir(
          tempDir,
          validationResult.files,
          LabFileService.writeConcurrency,
          reportProgress
        )
        const failedWriteDetails = writeResults.filter((r) => !r.success)

        if (failedWriteDetails.length === validationResult.files.length) {
          return {
            success: false,
            writtenCount: 0,
            failedFiles: failedWriteDetails.map((r) => r.path),
            failedFileDetails: failedWriteDetails,
            error: '所有文件写入临时目录均失败'
          }
        }

        reportProgress(
          `文件写入完成（成功 ${writeResults.length - failedWriteDetails.length}/${totalCount}），正在构建 tar...`
        )
        const tarPrepareStartTime = Date.now()
        archive = await this.createTarArchive(tempDir)
        archiveSizeBytes = archive.length
        totalContentBytes = this.calculateTotalContentBytes(validationResult.files)
        tarPrepareDurationMs = Date.now() - tarPrepareStartTime
        reportProgress('tar 构建完成，正准备上传到容器...')

        if (failedWriteDetails.length > 0) {
          logger.warn('部分文件写入临时目录失败', 'main', {
            labId,
            failedCount: failedWriteDetails.length,
            totalCount
          })
        }
      }

      const archiveSizeMB = (archiveSizeBytes / (1024 * 1024)).toFixed(2)
      reportProgress(`正在上传 tar 到容器（${archiveSizeMB} MB）...`)

      const container = dockerService.getDocker().getContainer(containerId)
      const uploadStartTime = Date.now()
      await container.putArchive(archive, { path: normalizedProjectRoot })
      const uploadDurationMs = Date.now() - uploadStartTime
      const totalDurationMs = Date.now() - totalStartTime

      reportProgress(`文件上传完成！共写入 ${totalCount} 个文件到 ${normalizedProjectRoot}`)

      logger.info('批量写入项目文件成功', 'main', {
        labId,
        containerId: containerId.substring(0, 12),
        projectRoot: normalizedProjectRoot,
        writtenCount: totalCount,
        totalContentBytes,
        archiveSizeBytes,
        tarPrepareDurationMs,
        uploadDurationMs,
        totalDurationMs
      })

      return {
        success: true,
        writtenCount: totalCount
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
   * 将文件内容并行写入本地临时目录
   * 返回每个文件的写入结果（支持部分成功）
   */
  private async writeFilesToTempDir(
    tempDir: string,
    files: NormalizedFileWriteRequest[],
    concurrency: number,
    onProgress?: (message: string) => void
  ): Promise<FileWriteEntryResult[]> {
    const results: FileWriteEntryResult[] = []
    const total = files.length
    let completed = 0

    const notifyProgress = (): void => {
      completed++
      if (completed % Math.max(1, Math.floor(total / 10)) === 0 || completed === total) {
        onProgress?.(`写入进度: ${completed}/${total} 个文件`)
      }
    }

    // 提前收集所有唯一目录并串行创建，避免并发 mkdir 竞争
    const dirSet = new Set<string>()
    for (const file of files) {
      const targetPath = normalize(join(tempDir, file.path))
      if (!isPathInTempRoot(tempDir, targetPath)) {
        results.push({
          path: file.path,
          success: false,
          error: `检测到不安全的目标路径: ${file.path}`
        })
        completed++
        continue
      }
      dirSet.add(dirname(targetPath))
    }
    const dirs = Array.from(dirSet).sort()
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true })
    }
    onProgress?.(`目录结构已创建（${dirs.length} 个目录），开始并发写入文件...`)

    // 分批并发写入文件内容
    await LabFileService.runWithConcurrency(files, concurrency, async (file) => {
      const targetPath = normalize(join(tempDir, file.path))
      if (!isPathInTempRoot(tempDir, targetPath)) {
        results.push({
          path: file.path,
          success: false,
          error: `检测到不安全的目标路径: ${file.path}`
        })
        notifyProgress()
        return
      }

      try {
        await this.writeSingleFileToTempDir(targetPath, file.content)
        results.push({ path: file.path, success: true })
        logger.debug('文件写入成功', 'main', { filePath: file.path })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.warn('写入文件到临时目录失败', 'main', {
          filePath: file.path,
          error: errorMessage
        })
        results.push({
          path: file.path,
          success: false,
          error: errorMessage
        })
      }
      notifyProgress()
    })

    return results
  }

  /**
   * 写入单个文件到临时目录
   * 大文件使用流式写入避免内存峰值
   */
  private async writeSingleFileToTempDir(targetPath: string, content: string): Promise<void> {
    const contentBuffer = Buffer.from(content, 'utf-8')

    if (contentBuffer.length > LARGE_FILE_THRESHOLD) {
      const writeStream = createWriteStream(targetPath)
      const CHUNK_SIZE = 64 * 1024

      for (let offset = 0; offset < contentBuffer.length; offset += CHUNK_SIZE) {
        const chunk = contentBuffer.subarray(offset, offset + CHUNK_SIZE)
        if (!writeStream.write(chunk)) {
          await new Promise<void>((resolve) => writeStream.once('drain', resolve))
        }
      }

      writeStream.end()
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve)
        writeStream.on('error', reject)
      })
    } else {
      await fs.writeFile(targetPath, contentBuffer)
    }
  }

  /**
   * 从内存中的文件内容准备 tar 条目
   */
  private createTarEntriesFromMemory(
    files: NormalizedFileWriteRequest[],
    onProgress?: (message: string) => void
  ): MemoryTarArchiveEntries {
    const total = files.length
    onProgress?.(`正在准备 tar 条目（${total} 个文件）...`)

    const directoryPaths = new Set<string>()
    const entries: TarEntry[] = []
    let totalContentBytes = 0

    for (const file of files) {
      const parts = file.path.split('/')
      for (let i = 1; i < parts.length; i++) {
        directoryPaths.add(parts.slice(0, i).join('/'))
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const sortedDirs = Array.from(directoryPaths).sort()
    for (const dirPath of sortedDirs) {
      entries.push({
        path: `${dirPath}/`,
        type: 'directory',
        mode: 0o755,
        mtime: now
      })
    }

    const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path))
    let processed = 0
    for (const file of sortedFiles) {
      const contentSize = Buffer.byteLength(file.content, 'utf-8')
      totalContentBytes += contentSize
      entries.push({
        path: file.path,
        type: 'file',
        mode: 0o644,
        mtime: now,
        content: file.content,
        size: contentSize
      })
      processed++
      if (processed % Math.max(1, Math.floor(total / 5)) === 0 || processed === total) {
        onProgress?.(`tar 条目准备进度: ${processed}/${total} 个文件`)
      }
    }

    return { entries, totalContentBytes }
  }

  private calculateTotalContentBytes(files: NormalizedFileWriteRequest[]): number {
    return files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf-8'), 0)
  }

  /**
   * 生成 tar archive，供 Docker putArchive 使用
   */
  private async createTarArchive(sourceDir: string): Promise<Buffer> {
    const entries = await this.collectTarEntries(sourceDir, sourceDir)
    return buildTarArchive(entries)
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
}
