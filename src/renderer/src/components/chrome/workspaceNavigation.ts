export type ViewMode = 'paper' | 'knowledge' | 'writer'

export interface WorkspaceNavItem {
  id: string
  icon: string
  view: ViewMode
}

/** 工作区一级导航的唯一来源，避免各入口维护不同的视图映射。 */
export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  { id: 'read', icon: 'read', view: 'paper' },
  { id: 'knowledge', icon: 'knowledge', view: 'knowledge' },
  { id: 'writer', icon: 'write', view: 'writer' }
]

/** 各视图一级导航标签的翻译 key（chrome.nav.*） */
export const WORKSPACE_NAV_LABEL_KEYS: Record<ViewMode, string> = {
  paper: 'chrome.nav.read',
  knowledge: 'chrome.nav.knowledge',
  writer: 'chrome.nav.writer'
}

/** 各视图"添加"按钮文案的翻译 key（chrome.nav.*） */
export const WORKSPACE_ADD_LABEL_KEYS: Record<ViewMode, string> = {
  paper: 'chrome.nav.addPaper',
  knowledge: 'chrome.nav.addKnowledge',
  writer: 'chrome.nav.addDocument'
}
