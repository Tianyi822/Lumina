import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MCPTool } from '@renderer/types'
import { useMCPStore } from '@renderer/stores/mcpStore'
import styles from './PaperChatMcpToolsPanel.module.css'

interface PaperChatMcpToolsPanelProps {
  selectedTools?: MCPTool[]
  compact?: boolean
  embedded?: boolean
  onToolsSelected: (tools: MCPTool[]) => void
}

function toolKey(tool: MCPTool): string {
  return `${tool.serverName}::${tool.name}`
}

export default function PaperChatMcpToolsPanel({
  selectedTools = [],
  compact,
  embedded = false,
  onToolsSelected
}: PaperChatMcpToolsPanelProps) {
  const toolsByServer = useMCPStore((s) => s.toolsByServer)
  const statuses = useMCPStore((s) => s.statuses)
  const searchQuery = useMCPStore((s) => s.searchQuery)
  const setSearchQuery = useMCPStore((s) => s.setSearchQuery)
  const loadAllTools = useMCPStore((s) => s.loadAllTools)
  const isServerConnected = useMCPStore((s) => s.isServerConnected)
  const [showPanel, setShowPanel] = useState(false)
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())
  const [localSelectedTools, setLocalSelectedTools] = useState<MCPTool[]>(selectedTools)
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set())
  const [needsExpandButton, setNeedsExpandButton] = useState<Set<string>>(new Set())
  const [highlightedTools, setHighlightedTools] = useState<Set<string>>(new Set())
  const mcpContainerRef = useRef<HTMLDivElement | null>(null)
  const descriptionRefs = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    setLocalSelectedTools(selectedTools)
  }, [selectedTools])

  const selectedToolKeys = useMemo(
    () => new Set(localSelectedTools.map((tool) => toolKey(tool))),
    [localSelectedTools]
  )

  const totalToolsCount = useMemo(
    () => Object.values(toolsByServer).reduce((sum, tools) => sum + tools.length, 0),
    [toolsByServer]
  )
  const connectedServersCount = useMemo(
    () => statuses.filter((status) => status.connected).length,
    [statuses]
  )

  const filteredToolsByServer = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return toolsByServer
    }

    const result: Record<string, MCPTool[]> = {}
    for (const [serverName, tools] of Object.entries(toolsByServer)) {
      const filtered = tools.filter(
        (tool) =>
          tool.name.toLowerCase().includes(query) ||
          (tool.description || '').toLowerCase().includes(query)
      )
      if (filtered.length > 0) {
        result[serverName] = filtered
      }
    }
    return result
  }, [searchQuery, toolsByServer])

  const refreshOverflowChecks = useCallback(() => {
    window.requestAnimationFrame(() => {
      setNeedsExpandButton((previous) => {
        const next = new Set(previous)
        for (const [key, element] of descriptionRefs.current.entries()) {
          if (element.scrollHeight > element.clientHeight + 1) {
            next.add(key)
          }
        }
        return next
      })
    })
  }, [])

  const loadTools = useCallback(async (): Promise<void> => {
    await loadAllTools()
    const nextStatuses = useMCPStore.getState().statuses
    setNeedsExpandButton(new Set())
    descriptionRefs.current.clear()
    setExpandedDescriptions(new Set())
    setExpandedServers(
      new Set(nextStatuses.filter((status) => status.connected).map((s) => s.serverName))
    )
    refreshOverflowChecks()
  }, [loadAllTools, refreshOverflowChecks])

  useEffect(() => {
    if (showPanel || embedded) {
      refreshOverflowChecks()
    }
  }, [expandedServers, filteredToolsByServer, refreshOverflowChecks, showPanel, embedded])

  useEffect(() => {
    if (embedded) {
      void loadTools()
    }
  }, [embedded, loadTools])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const container = mcpContainerRef.current
      if (showPanel && container && !container.contains(event.target as Node)) {
        setShowPanel(false)
      }
    }

    if (!embedded) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showPanel, embedded])

  useEffect(() => {
    const unsubscribe = window.api.mcp.onStatusChange(() => {
      void loadTools()
    })
    return () => unsubscribe()
  }, [loadTools])

  function emitToolsSelected(next: MCPTool[]): void {
    setLocalSelectedTools(next)
    onToolsSelected(next)
  }

  function togglePanel(): void {
    setShowPanel((current) => {
      const next = !current
      if (next) {
        void loadTools()
      }
      return next
    })
  }

  function isToolSelected(tool: MCPTool): boolean {
    return selectedToolKeys.has(toolKey(tool))
  }

  function toggleTool(tool: MCPTool): void {
    const key = toolKey(tool)
    emitToolsSelected(
      selectedToolKeys.has(key)
        ? localSelectedTools.filter((selected) => toolKey(selected) !== key)
        : [...localSelectedTools, tool]
    )
  }

  function isServerGroupFullySelected(tools: MCPTool[]): boolean {
    return tools.length > 0 && tools.every((tool) => isToolSelected(tool))
  }

  function toggleServerGroupTools(tools: MCPTool[]): void {
    if (isServerGroupFullySelected(tools)) {
      const toolKeys = new Set(tools.map((tool) => toolKey(tool)))
      emitToolsSelected(localSelectedTools.filter((selected) => !toolKeys.has(toolKey(selected))))
      return
    }

    const next = [...localSelectedTools]
    for (const tool of tools) {
      if (!selectedToolKeys.has(toolKey(tool))) {
        next.push(tool)
      }
    }
    emitToolsSelected(next)
  }

  function toggleServer(serverName: string): void {
    setExpandedServers((previous) => {
      const next = new Set(previous)
      if (next.has(serverName)) {
        next.delete(serverName)
      } else {
        next.add(serverName)
      }
      return next
    })
  }

  function setDescriptionRef(tool: MCPTool, element: HTMLDivElement | null): void {
    const key = toolKey(tool)
    if (!element) {
      descriptionRefs.current.delete(key)
      return
    }

    descriptionRefs.current.set(key, element)
    window.requestAnimationFrame(() => {
      if (element.scrollHeight > element.clientHeight + 1) {
        setNeedsExpandButton((previous) => new Set(previous).add(key))
      }
    })
  }

  function toggleDescription(tool: MCPTool): void {
    const key = toolKey(tool)
    setExpandedDescriptions((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function highlightTool(tool: MCPTool): void {
    const key = toolKey(tool)
    setHighlightedTools((previous) => new Set(previous).add(key))
    window.setTimeout(() => {
      setHighlightedTools((previous) => {
        const next = new Set(previous)
        next.delete(key)
        return next
      })
    }, 1500)
  }

  const showPanelContent = embedded || showPanel

  return (
    <div
      ref={mcpContainerRef}
      className={[
        styles['paper-chat-mcp-tools'],
        'paper-chat-mcp-tools',
        embedded ? styles['paper-chat-mcp-tools--embedded'] || '' : '',
        compact ? styles['is-compact'] || '' : '',
        compact ? 'is-compact' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!embedded && (
        <button
          type="button"
          className={[
            'btn',
            styles['paper-chat-mcp-tools__trigger'],
            showPanel ? styles.active || '' : '',
            localSelectedTools.length > 0 ? styles['has-selection'] || '' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          aria-expanded={showPanel}
          onClick={togglePanel}
        >
          {localSelectedTools.length > 0 ? (
            <span className={styles['paper-chat-mcp-tools__selected-name']}>
              已选 {localSelectedTools.length} 个工具
            </span>
          ) : (
            <span>{compact ? 'MCP' : 'MCP 工具'}</span>
          )}
          {totalToolsCount > 0 && (
            <span className={styles['paper-chat-mcp-tools__count']}>{totalToolsCount}</span>
          )}
          <span
            className={[
              styles['paper-chat-mcp-tools__dropdown-arrow'],
              showPanel ? styles.open || '' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            ▼
          </span>
        </button>
      )}

      {showPanelContent && (
        <div
          className={[
            styles['paper-chat-mcp-tools-panel'],
            'paper-chat-mcp-tools-panel',
            embedded ? styles['paper-chat-mcp-tools-panel--embedded'] || '' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!embedded && (
            <div className={styles['paper-chat-mcp-tools-panel__header']}>
              <span className={styles['paper-chat-mcp-tools-panel__title']}>MCP 工具（多选）</span>
              <span className={styles['paper-chat-mcp-tools-panel__connection-info']}>
                {connectedServersCount} 个服务器已连接
              </span>
            </div>
          )}

          <div className={styles['paper-chat-mcp-tools-panel__search']}>
            <input
              className={`input ${styles['paper-chat-mcp-tools-panel__search-input']}`}
              type="text"
              value={searchQuery}
              placeholder="搜索工具..."
              aria-label="搜索 MCP 工具"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className={styles['paper-chat-mcp-tools-panel__tools']}>
            {Object.keys(filteredToolsByServer).length === 0 ? (
              <div className={styles['paper-chat-mcp-tools-panel__empty']}>
                <p>
                  {searchQuery ? '未找到匹配的工具' : '暂无可用工具，请在设置中配置 MCP 服务器'}
                </p>
              </div>
            ) : (
              Object.entries(filteredToolsByServer).map(([serverName, tools]) => {
                const serverExpanded = expandedServers.has(serverName)
                const serverConnected = isServerConnected(serverName)
                return (
                  <div key={serverName} className={styles['paper-chat-mcp-tools-panel__server']}>
                    <div
                      className={styles['paper-chat-mcp-tools-panel__server-header']}
                      role="button"
                      tabIndex={0}
                      aria-expanded={serverExpanded}
                      onClick={() => toggleServer(serverName)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          toggleServer(serverName)
                        }
                      }}
                    >
                      <span className={styles['paper-chat-mcp-tools-panel__expand-icon']}>
                        {serverExpanded ? '▼' : '▶'}
                      </span>
                      <span className={styles['paper-chat-mcp-tools-panel__server-name']}>
                        {serverName}
                      </span>
                      <button
                        className={`btn ${styles['paper-chat-mcp-tools-panel__server-select-all']}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleServerGroupTools(tools)
                        }}
                      >
                        {isServerGroupFullySelected(tools) ? '取消全选' : '全选'}
                      </button>
                      <span
                        className={[
                          styles['paper-chat-mcp-tools-panel__server-status'],
                          serverConnected ? styles.connected || '' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {serverConnected ? '●' : '○'}
                      </span>
                      <span className={styles['paper-chat-mcp-tools__count-badge']}>
                        {tools.length}
                      </span>
                    </div>

                    {serverExpanded && (
                      <div className={styles['paper-chat-mcp-tools-panel__server-tools']}>
                        {tools.map((tool) => {
                          const selected = isToolSelected(tool)
                          const key = toolKey(tool)
                          const expanded = expandedDescriptions.has(key)
                          return (
                            <div
                              id={`tool-${serverName}-${tool.name}`}
                              key={key}
                              className={[
                                styles['paper-chat-mcp-tools-panel__tool'],
                                selected ? styles.selected || '' : '',
                                highlightedTools.has(key) ? styles.highlight || '' : ''
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              role="button"
                              tabIndex={0}
                              aria-selected={selected}
                              onClick={() => {
                                toggleTool(tool)
                                highlightTool(tool)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  toggleTool(tool)
                                  highlightTool(tool)
                                }
                              }}
                            >
                              <div className={styles['paper-chat-mcp-tools-panel__tool-header']}>
                                <span
                                  className={styles['paper-chat-mcp-tools-panel__tool-checkbox']}
                                >
                                  {selected ? '☑' : '☐'}
                                </span>
                                <span className={styles['paper-chat-mcp-tools-panel__tool-name']}>
                                  {tool.name}
                                </span>
                              </div>
                              {tool.description && (
                                <div
                                  className={
                                    styles['paper-chat-mcp-tools-panel__tool-description-wrapper']
                                  }
                                >
                                  <div
                                    ref={(element) => setDescriptionRef(tool, element)}
                                    className={[
                                      styles['paper-chat-mcp-tools-panel__tool-description'],
                                      expanded ? styles.expanded || '' : ''
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                  >
                                    {tool.description}
                                  </div>
                                  {needsExpandButton.has(key) && (
                                    <button
                                      className={
                                        styles['paper-chat-mcp-tools-panel__description-toggle']
                                      }
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        toggleDescription(tool)
                                      }}
                                    >
                                      {expanded ? '收起' : '展开'}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
