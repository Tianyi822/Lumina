import type {
  FileWriteRequest,
  FileWriteResult,
  FileReadResult,
  FileListResult,
  FileDeleteResult
} from '@shared/types/lab'

/**
 * 文件传输抽象接口
 * Docker 实现：通过 tar + copyToContainer 写入
 * SSH 实现：通过 SFTP 写入
 * 仅定义写入接口，文件读取通过 CommandExecutor 执行 cat 命令实现
 * @param targetId - 传输目标标识（容器 ID 或实验室 ID）
 * @param files - 待写入文件列表
 * @param projectRoot - 远程项目根目录
 * @param onProgress - 写入进度回调
 */
export interface FileTransfer {
  writeFiles(
    labId: string,
    files: FileWriteRequest[],
    projectRoot?: string,
    onProgress?: (message: string) => void
  ): Promise<FileWriteResult>

  /** 读取远程文件内容 */
  readFile(
    labId: string,
    path: string,
    options?: { offset?: number; maxBytes?: number }
  ): Promise<FileReadResult>

  /** 列出远程目录内容 */
  listFiles(
    labId: string,
    path: string,
    options?: { recursive?: boolean; maxEntries?: number }
  ): Promise<FileListResult>

  /** 删除远程文件或目录 */
  deleteFile(labId: string, path: string): Promise<FileDeleteResult>
}
