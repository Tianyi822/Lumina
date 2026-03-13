/**
 * 判断用户消息是否包含生成 PPT / 幻灯片意图
 */
export function isPresentationIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  const presentationKeywords = /(ppt|pptx|幻灯片|演示文稿|slides|slide deck|deck)/i
  const actionKeywords =
    /(生成|制作|创建|输出|整理|汇报|演示|做一份|做个|生成一份|generate|create|make|build|prepare)/i

  if (presentationKeywords.test(normalized) && actionKeywords.test(normalized)) {
    return true
  }

  return /(根据.+内容.+(生成|制作).*(ppt|幻灯片|演示文稿))/i.test(normalized)
}
