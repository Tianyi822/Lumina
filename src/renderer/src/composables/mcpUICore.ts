import type { MCPTool } from '@renderer/types'

export function makeToolKey(tool: { serverName: string; name: string }): string {
  return `${tool.serverName}-${tool.name}`
}

export function parseToolKey(key: string): { serverName: string; toolName: string } {
  const parts = key.split('-')
  return { serverName: parts[0], toolName: parts.slice(1).join('-') }
}

export function checkDescriptionOverflow(element: HTMLElement): boolean {
  const wasExpanded = element.classList.contains('expanded')
  if (wasExpanded) {
    element.classList.remove('expanded')
  }

  const hasOverflow = element.scrollHeight > element.clientHeight

  if (wasExpanded) {
    element.classList.add('expanded')
  }

  return hasOverflow
}

export function scrollToElementById(
  elementId: string,
  options: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition } = {}
): HTMLElement | null {
  const element = document.getElementById(elementId)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center', ...options })
  }
  return element
}

export function flashHighlight(element: HTMLElement, durationMs: number = 1500): void {
  element.classList.add('highlight')
  setTimeout(() => {
    element.classList.remove('highlight')
  }, durationMs)
}

export function scrollToToolDom(
  tool: MCPTool,
  expandedServers: Set<string>,
  onExpandServer: (serverName: string) => void
): void {
  const toolElementId = `tool-${tool.serverName}-${tool.name}`
  const toolElement = document.getElementById(toolElementId)

  if (!toolElement) return

  if (!expandedServers.has(tool.serverName)) {
    onExpandServer(tool.serverName)
    setTimeout(() => {
      const element = document.getElementById(toolElementId)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        flashHighlight(element)
      }
    }, 100)
  } else {
    toolElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    flashHighlight(toolElement)
  }
}
