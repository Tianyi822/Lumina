import { Client } from 'ssh2'
import type { ConnectConfig } from 'ssh2'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getConfigDirPath } from '@main/services/config/configPaths'
import type {
  ExecCommand,
  ExecResult,
  LabResult,
  FileWriteRequest,
  FileWriteResult
} from '@shared/types/lab'
import type {
  SshConnectionConfig,
  SshConnectionStatus,
  SshConnectResult,
  TestSshConnectionResult
} from '@shared/types/lab'
import { sshConnectionManager } from './SshConnectionManager'
import { SshCommandExecutor } from './SshCommandExecutor'
import { SftpFileTransfer } from './SftpFileTransfer'
import { sshTerminalService } from './SshTerminalService'
import type { CommandExecutor } from '../interfaces/CommandExecutor'
import type { FileTransfer } from '../interfaces/FileTransfer'
import { logger } from '@main/services/logger'

/**
 * SSH 服务
 * 提供 SSH 连接生命周期管理、命令执行、文件传输和连接测试
 */
export class SshService {
  readonly commandExecutor: CommandExecutor
  readonly fileTransfer: FileTransfer

  constructor() {
    this.commandExecutor = new SshCommandExecutor()
    this.fileTransfer = new SftpFileTransfer()
  }

  /**
   * 建立 SSH 连接
   * @param labId - 实验室 ID
   * @param config - SSH 连接配置
   * @param password - 密码（密码认证时使用）
   */
  async connect(
    labId: string,
    config: SshConnectionConfig,
    password?: string
  ): Promise<SshConnectResult> {
    let connectConfig: ConnectConfig
    try {
      connectConfig = this.buildConnectConfig(config, password)
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

  /**
   * 断开 SSH 连接
   */
  async disconnect(labId: string): Promise<LabResult> {
    return sshConnectionManager.disconnect(labId)
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(labId: string): SshConnectionStatus {
    return sshConnectionManager.getStatus(labId)
  }

  /**
   * 检查是否已连接
   */
  isConnected(labId: string): boolean {
    return sshConnectionManager.isConnected(labId)
  }

  /**
   * 执行 SSH 远程命令
   */
  async execCommand(labId: string, command: ExecCommand): Promise<ExecResult | null> {
    return this.commandExecutor.execCommand(labId, command)
  }

  /**
   * 通过 SFTP 向远程服务器写入文件
   * @param onProgress - 写入进度回调
   */
  async writeFiles(
    labId: string,
    files: FileWriteRequest[],
    projectRoot?: string,
    onProgress?: (message: string) => void
  ): Promise<FileWriteResult> {
    return this.fileTransfer.writeFiles(labId, files, projectRoot, onProgress)
  }

  /**
   * 测试 SSH 连接是否可达，并获取远程系统信息
   * 连接成功后自动执行 uname -s && hostname && echo $HOME 探测环境
   */
  async testConnection(
    config: SshConnectionConfig,
    password?: string
  ): Promise<TestSshConnectionResult> {
    let connectConfig: ConnectConfig
    try {
      connectConfig = this.buildConnectConfig(config, password)
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

  /**
   * 注册连接状态变化监听器
   */
  onConnectionStatusChange(
    listener: (labId: string, status: SshConnectionStatus, error?: string) => void
  ): void {
    sshConnectionManager.onStatusChange(listener)
  }

  /**
   * 移除连接状态变化监听器
   */
  offConnectionStatusChange(
    listener: (labId: string, status: SshConnectionStatus, error?: string) => void
  ): void {
    sshConnectionManager.offStatusChange(listener)
  }

  /**
   * 关闭 SSH 服务（关闭终端并断开所有连接）
   */
  async shutdown(): Promise<void> {
    sshTerminalService.shutdown()
    await sshConnectionManager.disconnectAll()
    logger.info('SSH 服务已关闭', 'main')
  }

  /**
   * 构建 ssh2 连接配置
   * 密码认证时直接传入密码，密钥认证时从文件读取或保存密钥内容
   */
  private buildConnectConfig(config: SshConnectionConfig, password?: string): ConnectConfig {
    const base: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 30_000,
      keepaliveInterval: 30_000,
      keepaliveCountMax: 3
    }

    if (config.authType === 'password') {
      // 密码认证
      base.password = password
    } else {
      // 密钥认证
      if (config.keyContent) {
        // 首次连接：保存密钥内容到文件并读取
        const keyName = config.keyName || 'id_rsa'
        const sshKeysDir = join(getConfigDirPath(), 'ssh-keys')
        if (!existsSync(sshKeysDir)) {
          mkdirSync(sshKeysDir, { recursive: true })
        }
        const keyFilePath = join(sshKeysDir, keyName)
        writeFileSync(keyFilePath, config.keyContent, { mode: 0o600 })
        logger.info('SSH 密钥已保存到文件', 'main', { keyFilePath })

        base.privateKey = readFileSync(keyFilePath, 'utf-8')
      } else if (config.keyName) {
        // 重连场景：无 keyContent 但有 keyName，从已保存的密钥文件读取
        const keyFilePath = join(getConfigDirPath(), 'ssh-keys', config.keyName)
        if (existsSync(keyFilePath)) {
          base.privateKey = readFileSync(keyFilePath, 'utf-8')
          logger.info('SSH 从已保存的文件读取密钥', 'main', { keyFilePath })
        }
      }
    }

    return base
  }
}

export const sshService = new SshService()
