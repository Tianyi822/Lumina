import { labService } from '../LabService'
import type { LabData } from '@shared/types/lab'

/**
 * 查找实验室（支持 ID 精确查找或名称模糊匹配）
 * 名称匹配优先级：精确匹配 > 包含匹配 > 分词部分匹配
 * @param args.lab_id - 实验室 ID（精确查找）
 * @param args.lab_name - 实验室名称（模糊匹配）
 * @returns 实验室数据，未找到时返回 null
 */
export async function findLab(args: {
  lab_id?: string
  lab_name?: string
}): Promise<LabData | null> {
  // 优先使用 ID 查找
  if (args.lab_id) {
    return await labService.loadLab(args.lab_id)
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
      return await labService.loadLab(match.labId)
    }
  }

  return null
}
