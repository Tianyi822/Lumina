import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { KnowledgeBase, MCPTool } from '@renderer/types'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import LabToolsToggle from '@renderer/components/lab/LabToolsToggle'
import PaperChatMcpToolsPanel from './PaperChatMcpToolsPanel'
import PaperChatKnowledgeBasePanel from './PaperChatKnowledgeBasePanel'
import styles from './PaperChatToolSelectionBar.module.css'

interface PaperChatToolSelectionBarProps {
  isSending?: boolean
  disabled?: boolean
  canSend?: boolean
  selectedTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableLabTools?: boolean
  enablePaperWebSearch?: boolean
  totalAttachmentCount?: number
  onUpdateSelectedTools: (value: MCPTool[]) => void
  onUpdateSelectedKnowledgeBases: (value: KnowledgeBase[]) => void
  onUpdateEnableLabTools: (value: boolean) => void
  onTogglePaperWebSearch: () => void
  onUpload: () => void
  onSend: () => void
  onStop: () => void
  children?: ReactNode
}

type AccordionSection = 'kb' | 'mcp'

/** 输入工具栏组件，包含附件上传、搜索开关、实验室开关、知识库/MCP 手风琴面板和发送按钮 */
export default function PaperChatToolSelectionBar({
  isSending,
  disabled,
  canSend = true,
  selectedTools,
  selectedKnowledgeBases,
  enableLabTools,
  enablePaperWebSearch,
  totalAttachmentCount = 0,
  onUpdateSelectedTools,
  onUpdateSelectedKnowledgeBases,
  onUpdateEnableLabTools,
  onTogglePaperWebSearch,
  onUpload,
  onSend,
  onStop,
  children
}: PaperChatToolSelectionBarProps) {
  // 发送中或 disabled 时禁用所有工具栏操作
  const controlsDisabled = Boolean(disabled || isSending)
  const [showMenu, setShowMenu] = useState(false)
  const [expandedSection, setExpandedSection] = useState<AccordionSection | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // 计算当前已开启的工具总数，用于 badge 显示
  const activeCount =
    selectedTools.length +
    selectedKnowledgeBases.length +
    (enablePaperWebSearch ? 1 : 0) +
    (enableLabTools ? 1 : 0)

  // 点击菜单外部关闭菜单，按 Escape 键同样关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const container = menuRef.current
      if (showMenu && container && !container.contains(event.target as Node)) {
        setShowMenu(false)
        setExpandedSection(null)
      }
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && showMenu) {
        setShowMenu(false)
        setExpandedSection(null)
      }
    }

    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showMenu])

  // 切换菜单展开/收起，关闭时同时重置手风琴状态
  function toggleMenu(): void {
    if (!controlsDisabled) {
      setShowMenu((current) => {
        if (current) {
          setExpandedSection(null)
        }
        return !current
      })
    }
  }

  // 手风琴切换：同一项再点收起，点不同项切换
  function toggleAccordion(section: AccordionSection): void {
    setExpandedSection((prev) => (prev === section ? null : section))
  }

  // 点击上传附件后关闭菜单并触发文件选择
  function handleUploadClick(): void {
    setShowMenu(false)
    setExpandedSection(null)
    onUpload()
  }

  const kbCount = selectedKnowledgeBases.length
  const mcpCount = selectedTools.length

  return (
    <div className={styles['paper-chat-input-toolbar']}>
      <div className={styles['paper-chat-input-toolbar__left']}>
        {/* "+" 按钮，展开综合菜单 */}
        <div ref={menuRef} className={styles['plus-menu-wrapper']}>
          <button
            className={[
              styles['plus-menu-trigger'],
              showMenu ? styles['plus-menu-trigger--active'] || '' : '',
              activeCount > 0 || totalAttachmentCount > 0
                ? styles['plus-menu-trigger--has-active'] || ''
                : ''
            ]
              .filter(Boolean)
              .join(' ')}
            type="button"
            disabled={controlsDisabled}
            title="添加附件或配置工具"
            onClick={toggleMenu}
          >
            <SvgIcon name="add" size={20} />
            {(activeCount > 0 || totalAttachmentCount > 0) && (
              <span className={styles['plus-menu-trigger__badge']}>
                {activeCount + totalAttachmentCount}
              </span>
            )}
          </button>

          {showMenu && (
            <div className={styles['plus-menu']}>
              {/* 上传附件 */}
              <button
                type="button"
                className={styles['plus-menu__row']}
                disabled={controlsDisabled}
                onClick={handleUploadClick}
              >
                <SvgIcon name="attachment" size={16} />
                <span className={styles['plus-menu__row-label']}>添加附件</span>
              </button>

              {/* 搜索开关 */}
              <button
                type="button"
                className={styles['plus-menu__row']}
                disabled={controlsDisabled}
                onClick={onTogglePaperWebSearch}
              >
                <SvgIcon name="search" size={16} />
                <span className={styles['plus-menu__row-label']}>搜索</span>
                <span className={styles['plus-menu__row-right']}>
                  <span
                    className={[
                      styles['plus-menu__toggle-switch'],
                      enablePaperWebSearch ? styles['plus-menu__toggle-switch--on'] || '' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden="true"
                  >
                    <span className={styles['plus-menu__toggle-thumb']} />
                  </span>
                </span>
              </button>

              {/* 实验室开关 */}
              <div className={styles['plus-menu__row']}>
                <SvgIcon name="lab-computer" size={16} />
                <LabToolsToggle
                  className={styles['plus-menu__lab-toggle']}
                  modelValue={Boolean(enableLabTools)}
                  disabled={controlsDisabled}
                  onUpdateModelValue={onUpdateEnableLabTools}
                />
              </div>

              {/* 知识库手风琴 */}
              <div
                className={`${styles['plus-menu__row']} ${styles['plus-menu__row--interactive']}`}
                onClick={() => toggleAccordion('kb')}
              >
                <SvgIcon name="knowledge" size={16} />
                <span className={styles['plus-menu__row-label']}>知识库</span>
                <span className={styles['plus-menu__row-right']}>
                  {kbCount > 0 && (
                    <span className={styles['plus-menu__count-badge']}>{kbCount}</span>
                  )}
                  <span
                    className={[
                      styles['plus-menu__accordion-arrow'],
                      expandedSection === 'kb'
                        ? styles['plus-menu__accordion-arrow--open'] || ''
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    ▶
                  </span>
                </span>
              </div>

              <div
                className={[
                  styles['plus-menu__accordion-body'],
                  expandedSection !== 'kb'
                    ? styles['plus-menu__accordion-body--collapsed'] || ''
                    : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles['plus-menu__accordion-inner']}>
                  <div className={styles['plus-menu__accordion-content']}>
                    <PaperChatKnowledgeBasePanel
                      embedded
                      selectedKnowledgeBases={selectedKnowledgeBases}
                      onSelectionChange={onUpdateSelectedKnowledgeBases}
                    />
                  </div>
                </div>
              </div>

              {/* MCP 手风琴 */}
              <div
                className={`${styles['plus-menu__row']} ${styles['plus-menu__row--interactive']}`}
                onClick={() => toggleAccordion('mcp')}
              >
                <SvgIcon name="mcp" size={16} />
                <span className={styles['plus-menu__row-label']}>MCP</span>
                <span className={styles['plus-menu__row-right']}>
                  {mcpCount > 0 && (
                    <span className={styles['plus-menu__count-badge']}>{mcpCount}</span>
                  )}
                  <span
                    className={[
                      styles['plus-menu__accordion-arrow'],
                      expandedSection === 'mcp'
                        ? styles['plus-menu__accordion-arrow--open'] || ''
                        : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    ▶
                  </span>
                </span>
              </div>

              <div
                className={[
                  styles['plus-menu__accordion-body'],
                  expandedSection !== 'mcp'
                    ? styles['plus-menu__accordion-body--collapsed'] || ''
                    : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles['plus-menu__accordion-inner']}>
                  <div className={styles['plus-menu__accordion-content']}>
                    <PaperChatMcpToolsPanel
                      embedded
                      selectedTools={selectedTools}
                      onToolsSelected={onUpdateSelectedTools}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={styles['paper-chat-input-toolbar__actions']}>
        {children}
        {/* 非发送态显示发送按钮，发送中切换为停止按钮 */}
        {!isSending ? (
          <button
            className={styles['paper-chat-input-toolbar__execute-button']}
            type="button"
            disabled={!canSend}
            title="发送"
            aria-label="发送"
            onClick={onSend}
          >
            <SvgIcon name="send" size={16} />
          </button>
        ) : (
          <button
            className={styles['paper-chat-input-toolbar__stop-button']}
            type="button"
            title="停止"
            aria-label="停止"
            onClick={onStop}
          >
            <SvgIcon name="stop" size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
