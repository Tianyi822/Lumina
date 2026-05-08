import type { FileWriteRequest, FileWriteResult, FileWriteEntryResult } from '@shared/types/lab'
import type { FileTransfer } from '../interfaces/FileTransfer'
import { sshConnectionManager } from './SshConnectionManager'
import type { Client, SFTPWrapper } from 'ssh2'
import { dirname } from 'path'
import { logger } from '@main/services/logger'

const WRITE_CONCURRENCY = 8

export class SftpFileTransfer implements FileTransfer {
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

  private getSftpClient(client: Client): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) reject(err)
        else resolve(sftp)
      })
    })
  }

  private mkdirRecursive(sftp: SFTPWrapper, dirPath: string): Promise<void> {
    return new Promise((resolve) => {
      sftp.mkdir(dirPath, (err) => {
        if (!err) {
          resolve()
          return
        }

        if ((err as unknown as { code: number }).code === 2 || (err as unknown as { code: number }).code === 4) {
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
