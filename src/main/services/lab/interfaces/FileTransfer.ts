import type { FileWriteRequest, FileWriteResult } from '@shared/types/lab'

/**
 * 文件传输抽象接口
 * Docker 实现：通过 tar + copyToContainer 写入
 * SSH 实现：通过 SFTP 写入
 * 仅定义写入接口，文件读取通过 CommandExecutor 执行 cat 命令实现
 */
export interface FileTransfer {
  writeFiles(
    targetId: string,
    files: FileWriteRequest[],
    projectRoot?: string,
    onProgress?: (message: string) => void
  ): Promise<FileWriteResult>
}
