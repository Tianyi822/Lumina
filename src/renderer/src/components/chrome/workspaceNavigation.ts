export type ViewMode = 'paper' | 'knowledge' | 'writer'

export interface WorkspaceNavItem {
  id: string
  icon: string
  label: string
  view: ViewMode
}

/** 工作区一级导航的唯一来源，避免各入口维护不同的视图映射。 */
export const WORKSPACE_NAV_ITEMS: WorkspaceNavItem[] = [
  { id: 'read', icon: 'read', label: '阅读', view: 'paper' },
  { id: 'knowledge', icon: 'knowledge', label: '知识库', view: 'knowledge' },
  { id: 'writer', icon: 'write', label: '写作', view: 'writer' }
]

export function getWorkspaceAddLabel(view: ViewMode): string {
  if (view === 'paper') return '添加论文'
  if (view === 'knowledge') return '新增知识库'
  return '新建文档'
}
