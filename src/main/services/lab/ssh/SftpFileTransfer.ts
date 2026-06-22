import type {
  FileWriteRequest,
  FileWriteResult,
  FileWriteEntryResult,
  FileReadResult,
  FileListResult,
  FileListEntry,
  FileDeleteResult
} from '@shared/types/lab'
import type { FileTransfer } from '../interfaces/FileTransfer'
import { sshConnectionManager } from './SshConnectionManager'
import type { Client, SFTPWrapper, Stats } from 'ssh2'
import { dirname } from 'path'
import { logger } from '@main/services/logger'

const WRITE_CONCURRENCY = 8

/**
 * SFTP 文件传输
 * 通过 SSH SFTP 协议向远程服务器批量写入文件
 */
export class SftpFileTransfer implements FileTransfer {
  /**
   * 批量写入文件到远程服务器
   * 自动创建目录结构，支持并发写入
   * @param labId - 实验室 ID
   * @param files - 待写入文件列表
   * @param projectRoot - 远程项目根目录路径
   * @param onProgress - 进度回调
   */
  async writeFiles(
    labId: string,
    files: FileWriteRequest[],
    projectRoot: string = '/app',
    onProgress?: (message: string) => void
  ): Promise<FileWriteResult> {
    const client = sshConnectionManager.getClient(labId)
    if (!client) {
      return { success: false, writtenCount: 0, error: 'SSH 客户端未连接' }
    }

    if (!files || files.length === 0) {
      return { success: false, writtenCount: 0, error: '文件列表为空' }
    }

    try {
      const sftp = await this.getSftpClient(client)
      const normalized = this.normalizeFiles(files, projectRoot)

      const directories = new Set<string>()
      for (const file of normalized) {
        const dir = dirname(file.remotePath)
        const parts = dir.split('/')
        for (let i = 1; i <= parts.length; i++) {
          directories.add(parts.slice(0, i).join('/'))
        }
      }

      const sortedDirs = Array.from(directories).sort()
      for (const dir of sortedDirs) {
        await this.mkdirRecursive(sftp, dir)
      }

      onProgress?.(`准备写入 ${normalized.length} 个文件`)

      const results = await this.runWithConcurrency(normalized, WRITE_CONCURRENCY, (file) =>
        this.writeFile(sftp, file)
      )

      const failedFiles = results.filter((r) => !r.success)
      const writtenCount = results.filter((r) => r.success).length

      if (failedFiles.length > 0) {
        onProgress?.(`写入完成: ${writtenCount} 成功, ${failedFiles.length} 失败`)
      } else {
        onProgress?.(`写入完成: ${writtenCount} 个文件`)
      }

      return {
        success: failedFiles.length === 0,
        writtenCount,
        failedFiles: failedFiles.length > 0 ? failedFiles.map((f) => f.path) : undefined,
        failedFileDetails: failedFiles.length > 0 ? failedFiles : undefined
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      logger.error('SFTP 文件写入失败', 'main', { labId, error })
      return { success: false, writtenCount: 0, error }
    }
  }

  /**
   * 读取远程文件内容
   * 支持从指定偏移读取与字节上限截断；二进制文件（含 NUL 字节）拒绝读取
   */
  async readFile(
    labId: string,
    path: string,
    options?: { offset?: number; maxBytes?: number }
  ): Promise<FileReadResult> {
    const client = sshConnectionManager.getClient(labId)
    if (!client) {
      return { success: false, error: 'SSH 客户端未连接' }
    }

    try {
      const sftp = await this.getSftpClient(client)
      const offset = options?.offset ?? 0
      const maxBytes = options?.maxBytes ?? 512000

      // 先 stat 获取大小
      const stats = await this.statFile(sftp, path)
      if (!stats) {
        return { success: false, path, error: '文件不存在或不可访问' }
      }

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        const stream = sftp.createReadStream(path, { start: offset, end: offset + maxBytes - 1 })
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('error', reject)
        stream.on('close', () => resolve(Buffer.concat(chunks)))
      })

      // 二进制文件（含 NUL 字节）拒绝读取：先检原始字节，避免无谓的 utf8 解码
      if (buffer.includes(0)) {
        return { success: false, path, error: '文件为二进制内容，无法以文本读取' }
      }

      const content = buffer.toString('utf8')
      // 是否还有未读字节（从 offset 起算剩余字节超过 maxBytes 即发生截断）
      const truncated = stats.size - offset > maxBytes
      return {
        success: true,
        path,
        size: stats.size,
        content,
        truncated: truncated || undefined,
        totalBytes: truncated ? stats.size : undefined
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      logger.error('SFTP 文件读取失败', 'main', { labId, path, error })
      return { success: false, path, error }
    }
  }

  /**
   * 列出远程目录内容
   * 非递归一次 readdir；递归采用 DFS，受 maxEntries 截断
   */
  async listFiles(
    labId: string,
    path: string,
    options?: { recursive?: boolean; maxEntries?: number }
  ): Promise<FileListResult> {
    const client = sshConnectionManager.getClient(labId)
    if (!client) {
      return { success: false, error: 'SSH 客户端未连接' }
    }

    try {
      const sftp = await this.getSftpClient(client)
      const maxEntries = options?.maxEntries ?? 1000
      const entries: FileListEntry[] = []
      let truncated = false

      if (options?.recursive) {
        await this.collectEntries(sftp, path, entries, maxEntries, () => {
          truncated = true
        })
      } else {
        const raw = await this.readDirEntries(sftp, path, true)
        if (raw.length > maxEntries) {
          entries.push(...raw.slice(0, maxEntries))
          truncated = true
        } else {
          entries.push(...raw)
        }
      }

      return { success: true, path, entries, truncated: truncated || undefined }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      logger.error('SFTP 列目录失败', 'main', { labId, path, error })
      return { success: false, path, error }
    }
  }

  /**
   * 删除远程文件或目录（目录递归删除）
   */
  async deleteFile(labId: string, path: string): Promise<FileDeleteResult> {
    const client = sshConnectionManager.getClient(labId)
    if (!client) {
      return { success: false, error: 'SSH 客户端未连接' }
    }

    try {
      const sftp = await this.getSftpClient(client)
      const stats = await this.statFile(sftp, path)
      if (!stats) {
        return { success: false, error: '路径不存在或不可访问' }
      }

      if (stats.isDirectory()) {
        await this.rmdirRecursive(sftp, path)
      } else {
        await new Promise<void>((resolve, reject) => {
          sftp.unlink(path, (err) => (err ? reject(err) : resolve()))
        })
      }
      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      logger.error('SFTP 删除失败', 'main', { labId, path, error })
      return { success: false, error }
    }
  }

  /**
   * 获取远程路径属性
   */
  private statFile(sftp: SFTPWrapper, path: string): Promise<Stats | null> {
    return new Promise((resolve) => {
      sftp.stat(path, (err, stats) => {
        if (err) resolve(null)
        else resolve(stats)
      })
    })
  }

  /**
   * 读取目录条目并映射为 FileListEntry
   * @param withSize - 是否携带 size 字段（删除递归无需 size）
   */
  private readDirEntries(
    sftp: SFTPWrapper,
    dir: string,
    withSize: boolean
  ): Promise<FileListEntry[]> {
    return new Promise((resolve, reject) => {
      sftp.readdir(dir, (err, list) => {
        if (err) reject(err)
        else
          resolve(
            list.map((e) => ({
              name: e.filename,
              type: (e.attrs.isDirectory() ? 'dir' : 'file') as 'dir' | 'file',
              ...(withSize ? { size: e.attrs.size } : {})
            }))
          )
      })
    })
  }

  /**
   * 递归收集目录条目（DFS），达到上限后停止并通知截断（onTruncate 仅首次触发）
   */
  private async collectEntries(
    sftp: SFTPWrapper,
    dir: string,
    out: FileListEntry[],
    maxEntries: number,
    onTruncate: () => void
  ): Promise<void> {
    const raw = await this.readDirEntries(sftp, dir, true)

    for (const entry of raw) {
      if (out.length >= maxEntries) {
        onTruncate()
        return
      }
      out.push(entry)
      if (entry.type === 'dir') {
        await this.collectEntries(
          sftp,
          `${dir}/${entry.name}`.replace(/\/+/g, '/'),
          out,
          maxEntries,
          onTruncate
        )
        if (out.length >= maxEntries) {
          onTruncate()
          return
        }
      }
    }
  }

  /**
   * 递归删除远程目录
   */
  private async rmdirRecursive(sftp: SFTPWrapper, dir: string): Promise<void> {
    const entries = await this.readDirEntries(sftp, dir, false)

    for (const entry of entries) {
      const child = `${dir}/${entry.name}`.replace(/\/+/g, '/')
      if (entry.type === 'dir') {
        await this.rmdirRecursive(sftp, child)
      } else {
        await new Promise<void>((resolve, reject) => {
          sftp.unlink(child, (err) => (err ? reject(err) : resolve()))
        })
      }
    }
    await new Promise<void>((resolve, reject) => {
      sftp.rmdir(dir, (err) => (err ? reject(err) : resolve()))
    })
  }

  /**
   * 规范文件路径，确保以 projectRoot 为前缀
   */
  private normalizeFiles(
    files: FileWriteRequest[],
    projectRoot: string
  ): Array<{ remotePath: string; content: string }> {
    const normalizedRoot = projectRoot.startsWith('/') ? projectRoot : `/${projectRoot}`
    return files.map((file) => ({
      remotePath: `${normalizedRoot}/${file.path}`.replace(/\/+/g, '/'),
      content: file.content
    }))
  }

  /**
   * 从 SSH 客户端获取 SFTP 子会话
   */
  private getSftpClient(client: Client): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) reject(err)
        else resolve(sftp)
      })
    })
  }

  /**
   * 递归创建远程目录
   * 遇到父目录不存在时自动向上递归创建
   */
  private mkdirRecursive(sftp: SFTPWrapper, dirPath: string): Promise<void> {
    return new Promise((resolve) => {
      sftp.mkdir(dirPath, (err) => {
        if (!err) {
          resolve()
          return
        }

        if (
          (err as unknown as { code: number }).code === 2 ||
          (err as unknown as { code: number }).code === 4
        ) {
          // SSH_FX_NO_SUCH_FILE(2): 父目录不存在; SSH_FX_FAILURE(4): 目录已存在或其他可恢复错误
          const parent = dirname(dirPath)
          if (parent === dirPath || !parent) {
            resolve()
            return
          }
          this.mkdirRecursive(sftp, parent).then(() => {
            sftp.mkdir(dirPath, () => resolve())
          })
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * 通过 SFTP 写入单个文件
   */
  private writeFile(
    sftp: SFTPWrapper,
    file: { remotePath: string; content: string }
  ): Promise<FileWriteEntryResult> {
    return new Promise((resolve) => {
      const stream = sftp.createWriteStream(file.remotePath)
      stream.on('error', (err: Error) => {
        resolve({ path: file.remotePath, success: false, error: err.message })
      })
      stream.on('close', () => {
        resolve({ path: file.remotePath, success: true })
      })
      stream.end(file.content)
    })
  }

  /**
   * 并发执行异步任务，控制并发数
   */
  private async runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = []
    let index = 0

    async function worker(): Promise<void> {
      while (index < items.length) {
        const currentIndex = index++
        const result = await fn(items[currentIndex])
        results[currentIndex] = result
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
    await Promise.all(workers)
    return results
  }
}
