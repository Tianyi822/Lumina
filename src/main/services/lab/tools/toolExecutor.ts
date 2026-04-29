import { labService } from '../LabService'
import { LabData } from '@shared/types/lab'

/**
 * 查找实验室（支持 ID 或名称模糊匹配）
 */
export async function findLab(args: {
  lab_id?: string
  lab_name?: string
}): Promise<LabData | null> {
  // 优先使用 ID 查找
  if (args.lab_id) {
    return labService.loadLab(args.lab_id)
  }

  // 使用名称模糊匹配
  if (args.lab_name) {
    const allLabs = await labService.listLabs()
    const searchName = args.lab_name.toLowerCase()

    // 首先尝试精确匹配
    let match = allLabs.find((s) => s.name.toLowerCase() === searchName)

    // 然后尝试包含匹配
    if (!match) {
      match = allLabs.find((s) => s.name.toLowerCase().includes(searchName))
    }

    // 最后尝试部分匹配（每个词）
    if (!match) {
      const searchWords = searchName.split(/\s+/)
      match = allLabs.find((s) => {
        const labName = s.name.toLowerCase()
        return searchWords.some((word) => labName.includes(word))
      })
    }

    if (match) {
      return labService.loadLab(match.labId)
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
