import { Client } from 'ssh2'
import type { ConnectConfig } from 'ssh2'
import { readFile } from 'fs/promises'
import type { ExecCommand, ExecResult, LabResult, FileWriteRequest, FileWriteResult } from '@shared/types/lab'
import type {
  SshConnectionConfig,
  SshConnectionStatus,
  SshConnectResult,
  TestSshConnectionResult
} from '@shared/types/lab'
import { sshConnectionManager } from './SshConnectionManager'
import { SshCommandExecutor } from './SshCommandExecutor'
import { SftpFileTransfer } from './SftpFileTransfer'
import type { CommandExecutor } from '../interfaces/CommandExecutor'
import type { FileTransfer } from '../interfaces/FileTransfer'
import { logger } from '@main/services/logger'

export class SshService {
  readonly commandExecutor: CommandExecutor
  readonly fileTransfer: FileTransfer

  constructor() {
    this.commandExecutor = new SshCommandExecutor()
    this.fileTransfer = new SftpFileTransfer()
  }

  async connect(labId: string, config: SshConnectionConfig): Promise<SshConnectResult> {
    let connectConfig: ConnectConfig
    try {
      connectConfig = await this.buildConnectConfig(config)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        status: 'disconnected'
      }
    }

    const result = await sshConnectionManager.connect(labId, connectConfig)

    if (result.success) {
      return { success: true, status: 'connected' }
    }

    return { success: false, error: result.error, status: 'disconnected' }
  }

  async disconnect(labId: string): Promise<LabResult> {
    return sshConnectionManager.disconnect(labId)
  }

  getConnectionStatus(labId: string): SshConnectionStatus {
    return sshConnectionManager.getStatus(labId)
  }

  isConnected(labId: string): boolean {
    return sshConnectionManager.isConnected(labId)
  }

  async execCommand(labId: string, command: ExecCommand): Promise<ExecResult | null> {
    return this.commandExecutor.execCommand(labId, command)
  }

  async writeFiles(
    labId: string,
    files: FileWriteRequest[],
    projectRoot?: string,
    onProgress?: (message: string) => void
  ): Promise<FileWriteResult> {
    return this.fileTransfer.writeFiles(labId, files, projectRoot, onProgress)
  }

  async testConnection(config: SshConnectionConfig): Promise<TestSshConnectionResult> {
    let connectConfig: ConnectConfig
    try {
      connectConfig = await this.buildConnectConfig(config)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    const client = new Client()

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        client.end()
        resolve({ success: false, error: 'SSH 连接测试超时' })
      }, 15_000)

      client.on('ready', () => {
        client.exec('uname -s && hostname && echo $HOME', (err, stream) => {
          clearTimeout(timeout)
          if (err) {
            client.end()
            resolve({ success: false, error: `获取系统信息失败: ${err.message}` })
            return
          }

          const chunks: Buffer[] = []
          stream.on('data', (data: Buffer) => chunks.push(data))
          stream.on('close', () => {
            client.end()
            const output = Buffer.concat(chunks).toString('utf-8').trim()
            const lines = output.split('\n')

            resolve({
              success: true,
              systemInfo: {
                platform: lines[0]?.trim() || 'unknown',
                hostname: lines[1]?.trim() || 'unknown',
                homeDir: lines[2]?.trim() || 'unknown'
              }
            })
          })
        })
      })

      client.on('error', (err: Error) => {
        clearTimeout(timeout)
        resolve({ success: false, error: `SSH 连接测试失败: ${err.message}` })
      })

      try {
        client.connect(connectConfig)
      } catch (err) {
        clearTimeout(timeout)
        resolve({
          success: false,
          error: `SSH 连接测试失败: ${err instanceof Error ? err.message : String(err)}`
        })
      }
    })
  }

  onConnectionStatusChange(
    listener: (labId: string, status: SshConnectionStatus, error?: string) => void
  ): void {
    sshConnectionManager.onStatusChange(listener)
  }

  offConnectionStatusChange(
    listener: (labId: string, status: SshConnectionStatus, error?: string) => void
  ): void {
    sshConnectionManager.offStatusChange(listener)
  }

  async shutdown(): Promise<void> {
    await sshConnectionManager.disconnectAll()
    logger.info('SSH 服务已关闭', 'main')
  }

  private async buildConnectConfig(config: SshConnectionConfig): Promise<ConnectConfig> {
    const base: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 30_000,
      keepaliveInterval: 30_000,
      keepaliveCountMax: 3
    }

    if (config.authType === 'password') {
      base.password = config.password
    } else {
      if (config.keyContent) {
        base.privateKey = config.keyContent
      } else if (config.keyPath) {
        try {
          base.privateKey = await readFile(config.keyPath, 'utf-8')
        } catch (err) {
          logger.error('SSH 密钥文件读取失败', 'main', {
            keyPath: config.keyPath,
            error: err instanceof Error ? err.message : String(err)
          })
          throw new Error(`密钥文件读取失败: ${config.keyPath}`)
        }
      }

      if (config.passphrase) {
        base.passphrase = config.passphrase
      }
    }

    return base
  }
}

export const sshService = new SshService()
