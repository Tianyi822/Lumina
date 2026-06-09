import type { UpdateDiagnosticCode } from '@shared/types/update'

interface UpdateChannelTarget {
  channel: string | null
  allowDowngrade: boolean
}

export interface UpdateDiagnostic {
  diagnosticCode: UpdateDiagnosticCode
  message: string
}

export interface UpdateCheckLike {
  isUpdateAvailable?: boolean | null
}

/**
 * 检查更新结果是否表示有可用更新
 * @param result autoUpdater 检查结果或类似结构
 */
export function hasAvailableUpdate(result: UpdateCheckLike | null | undefined): boolean {
  return result?.isUpdateAvailable === true
}

/**
 * 根据平台配置更新通道
 * Windows 使用 'latest-win' 通道，macOS/Linux 使用默认通道
 * @param updater 支持通道配置的对象
 * @param platform 目标平台，默认当前进程平台
 */
export function configurePlatformUpdateChannel(
  updater: UpdateChannelTarget,
  platform: NodeJS.Platform = process.platform
): void {
  if (platform !== 'win32') {
    return
  }

  updater.channel = 'latest-win'
  updater.allowDowngrade = false
}

/**
 * 分类更新错误，返回诊断信息和用户友好的错误消息
 * 根据错误消息特征识别：元数据缺失、资源缺失、签名无效、网络错误等
 * @param rawMessage 原始错误消息
 */
export function classifyUpdateError(rawMessage: string): UpdateDiagnostic {
  const message = rawMessage.trim() || '未知更新错误'
  const channelMatch = message.match(
    /Cannot find (latest(?:-win|-mac)?\.yml) in the latest release artifacts/
  )

  if (channelMatch) {
    return {
      diagnosticCode: 'metadata-missing',
      message: `GitHub Release 顶层缺少 ${channelMatch[1]}，请重新发布自动更新元数据`
    }
  }

  if (
    /ERR_UPDATER_ASSET_NOT_FOUND/i.test(message) ||
    /Cannot find asset/i.test(message) ||
    /No files provided/i.test(message) ||
    /\.(?:exe|dmg|zip|blockmap)[^:]*:\s*HttpError:\s*404/i.test(message)
  ) {
    return {
      diagnosticCode: 'asset-missing',
      message: 'GitHub Release 缺少更新元数据引用的安装包或 blockmap 文件'
    }
  }

  if (
    /ERR_UPDATER_INVALID_SIGNATURE|not signed by|signature|did not pass validation/i.test(message)
  ) {
    return {
      diagnosticCode: 'signature-invalid',
      message:
        '更新安装包签名校验失败，请手动下载最新正式版本。如果当前版本来自未签名测试包，需要手动安装一次后才能继续使用自动更新。'
    }
  }

  if (
    /ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ERR_INTERNET_DISCONNECTED|net::|fetch failed|Timed out/i.test(
      message
    )
  ) {
    return {
      diagnosticCode: 'network-error',
      message: '无法连接 GitHub 更新服务，请检查网络后重试'
    }
  }

  return {
    diagnosticCode: 'unknown',
    message
  }
}
