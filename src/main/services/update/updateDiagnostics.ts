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

export function hasAvailableUpdate(result: UpdateCheckLike | null | undefined): boolean {
  return result?.isUpdateAvailable === true
}

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
