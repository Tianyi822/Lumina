import { sandboxService } from '../SandboxService'
import { SandboxData } from '@shared/types/sandbox'

/**
 * 查找沙箱（支持 ID 或名称模糊匹配）
 */
export async function findSandbox(args: {
  sandbox_id?: string
  sandbox_name?: string
}): Promise<SandboxData | null> {
  // 优先使用 ID 查找
  if (args.sandbox_id) {
    return sandboxService.loadSandbox(args.sandbox_id)
  }

  // 使用名称模糊匹配
  if (args.sandbox_name) {
    const allSandboxes = await sandboxService.listSandboxs()
    const searchName = args.sandbox_name.toLowerCase()

    // 首先尝试精确匹配
    let match = allSandboxes.find((s) => s.name.toLowerCase() === searchName)

    // 然后尝试包含匹配
    if (!match) {
      match = allSandboxes.find((s) => s.name.toLowerCase().includes(searchName))
    }

    // 最后尝试部分匹配（每个词）
    if (!match) {
      const searchWords = searchName.split(/\s+/)
      match = allSandboxes.find((s) => {
        const sandboxName = s.name.toLowerCase()
        return searchWords.some((word) => sandboxName.includes(word))
      })
    }

    if (match) {
      return sandboxService.loadSandbox(match.sandboxId)
    }
  }

  return null
}

/**
 * 检查命令是否包含危险操作
 */
export function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /rm\s+-rf\s+\//, // rm -rf /
    /mkfs\./, // 格式化文件系统
    /dd\s+if=.*of=\/dev/, // dd 写入设备
    />\s*\/dev\/null/, // 重定向到 null
    /:\(\)\{\s*:\|:&\s*\};/, // Fork bomb
    /curl.*\|.*sh/, // curl 管道到 shell
    /wget.*\|.*sh/ // wget 管道到 shell
  ]

  return dangerousPatterns.some((pattern) => pattern.test(command))
}
