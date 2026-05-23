import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  useContainerStore,
  useLabCreatorStore,
  useComposeConfigStore,
  useDockerfileConfigStore,
  useDockerConfigStore,
  usePortMappingStore
} from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { CssTransition } from '@renderer/components/motion/CssTransition'
import ContainerSelector from './ContainerSelector'
import ComposeEditor from './ComposeEditor'
import DockerfileEditor from './DockerfileEditor'
import SaveConfigDialog from './SaveConfigDialog'
import CreateTypeSelector from './creator/CreateTypeSelector'
import CreateActions from './creator/CreateActions'
import PortMappingSection from './creator/PortMappingSection'
import type { DockerStatus } from '@renderer/types/lab'
import './creator/lab-creator.css'
import styles from './LabCreator.module.css'

const CONTENT_HEIGHT_TRANSITION_MS = 220
const CONTENT_HEIGHT_TRANSITION_FALLBACK_MS = CONTENT_HEIGHT_TRANSITION_MS + 80
const DOCKER_CREATE_TYPES = new Set(['compose', 'dockerfile', 'existing'])

interface LabCreatorProps {
  visible: boolean
  dockerStatus?: DockerStatus | null
  onClose: () => void
}

export default function LabCreator({ visible, dockerStatus, onClose }: LabCreatorProps) {
  const creatorStore = useLabCreatorStore()
  const composeConfigStore = useComposeConfigStore()
  const dockerfileConfigStore = useDockerfileConfigStore()
  const notify = useNotification()

  const [isTestingSsh, setIsTestingSsh] = useState(false)
  const [isContentMeasured, setIsContentMeasured] = useState(false)
  const [isContentVisible, setIsContentVisible] = useState(true)
  const [isContentHeightTransitioning, setIsContentHeightTransitioning] = useState(false)
  const creatorRef = useRef<HTMLDivElement | null>(null)
  const contentShellRef = useRef<HTMLDivElement | null>(null)
  const contentInnerRef = useRef<HTMLDivElement | null>(null)
  const contentResizeObserverRef = useRef<ResizeObserver | null>(null)
  const contentResizeFrameRef = useRef<number | null>(null)
  const contentHeightFrameRef = useRef<number | null>(null)
  const contentTransitionTimerRef = useRef<number | null>(null)
  const pendingContentVisibleRef = useRef(false)
  const wasVisibleRef = useRef(false)

  const clearCreateError = (): void => {
    creatorStore.clearCreateError()
  }

  const clearContentHeightFrame = useCallback((): void => {
    if (contentHeightFrameRef.current !== null) {
      window.cancelAnimationFrame(contentHeightFrameRef.current)
      contentHeightFrameRef.current = null
    }
  }, [])

  const clearContentResizeFrame = useCallback((): void => {
    if (contentResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(contentResizeFrameRef.current)
      contentResizeFrameRef.current = null
    }
  }, [])

  const clearContentTransitionTimer = useCallback((): void => {
    if (contentTransitionTimerRef.current !== null) {
      window.clearTimeout(contentTransitionTimerRef.current)
      contentTransitionTimerRef.current = null
    }
  }, [])

  const readCreatorContentAvailableHeight = useCallback((): number => {
    const creator = creatorRef.current
    const shell = contentShellRef.current
    if (!creator || !shell) return Number.POSITIVE_INFINITY

    const creatorStyles = window.getComputedStyle(creator)
    const creatorRect = creator.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const maxHeightValue = creatorStyles.maxHeight
    const maxCreatorHeight = maxHeightValue.endsWith('vh')
      ? (window.innerHeight * Number.parseFloat(maxHeightValue)) / 100
      : Number.parseFloat(maxHeightValue)
    const creatorHeightLimit = Number.isFinite(maxCreatorHeight)
      ? maxCreatorHeight
      : creator.clientHeight
    const shellTop = shellRect.top - creatorRect.top

    return Math.max(1, Math.floor(creatorHeightLimit - shellTop))
  }, [])

  const setCreatorContentHeight = useCallback(
    (height: number): void => {
      const shell = contentShellRef.current
      if (!shell || height <= 0) return

      setIsContentMeasured(true)
      shell.style.height = `${Math.min(height, readCreatorContentAvailableHeight())}px`
    },
    [readCreatorContentAvailableHeight]
  )

  const readCreatorContentHeight = useCallback((): number => {
    const shell = contentShellRef.current
    const inner = contentInnerRef.current
    if (!inner) return 0
    if (!shell) return Math.ceil(inner.scrollHeight)

    const availableHeight = readCreatorContentAvailableHeight()
    const previousShellHeight = shell.style.height
    const previousShellOverflow = shell.style.overflow
    const previousShellTransition = shell.style.transition
    const previousInnerMaxHeight = inner.style.maxHeight
    const previousInnerOverflowY = inner.style.overflowY

    try {
      shell.style.height = 'auto'
      shell.style.overflow = 'visible'
      shell.style.transition = 'none'
      inner.style.maxHeight = 'none'
      inner.style.overflowY = 'visible'

      return Math.min(Math.ceil(inner.scrollHeight), availableHeight)
    } finally {
      shell.style.height = previousShellHeight
      shell.style.overflow = previousShellOverflow
      shell.style.transition = previousShellTransition
      inner.style.maxHeight = previousInnerMaxHeight
      inner.style.overflowY = previousInnerOverflowY
    }
  }, [readCreatorContentAvailableHeight])

  const lockCreatorContentHeight = useCallback((): void => {
    const shell = contentShellRef.current
    if (!shell) return

    setCreatorContentHeight(Math.ceil(shell.offsetHeight))
    void shell.offsetHeight
  }, [setCreatorContentHeight])

  const animateCreatorContentHeightTo = useCallback(
    (nextHeight: number): void => {
      clearContentHeightFrame()
      contentHeightFrameRef.current = window.requestAnimationFrame(() => {
        contentHeightFrameRef.current = null
        setCreatorContentHeight(nextHeight)
      })
    },
    [clearContentHeightFrame, setCreatorContentHeight]
  )

  const finishPendingContentTransition = useCallback((): void => {
    if (!pendingContentVisibleRef.current) return

    pendingContentVisibleRef.current = false
    setIsContentHeightTransitioning(false)
    setIsContentVisible(true)
    clearContentTransitionTimer()
  }, [clearContentTransitionTimer])

  const syncCreatorContentHeight = useCallback((): void => {
    const nextHeight = readCreatorContentHeight()
    if (nextHeight <= 0) return

    lockCreatorContentHeight()
    animateCreatorContentHeightTo(nextHeight)
  }, [animateCreatorContentHeightTo, lockCreatorContentHeight, readCreatorContentHeight])

  const observeCreatorContent = useCallback((): void => {
    contentResizeObserverRef.current?.disconnect()
    clearContentResizeFrame()

    if (typeof ResizeObserver === 'undefined' || !contentInnerRef.current) return

    contentResizeObserverRef.current = new ResizeObserver(() => {
      if (!visible || !isContentVisible || isContentHeightTransitioning) return
      if (contentResizeFrameRef.current !== null) return

      contentResizeFrameRef.current = window.requestAnimationFrame(() => {
        contentResizeFrameRef.current = null
        syncCreatorContentHeight()
      })
    })
    contentResizeObserverRef.current.observe(contentInnerRef.current)
  }, [
    clearContentResizeFrame,
    isContentHeightTransitioning,
    isContentVisible,
    syncCreatorContentHeight,
    visible
  ])

  const initializeCreatorContentHeight = useCallback((): void => {
    clearContentHeightFrame()
    contentHeightFrameRef.current = window.requestAnimationFrame(() => {
      contentHeightFrameRef.current = window.requestAnimationFrame(() => {
        contentHeightFrameRef.current = null
        observeCreatorContent()
        syncCreatorContentHeight()
        setIsContentVisible(true)
      })
    })
  }, [clearContentHeightFrame, observeCreatorContent, syncCreatorContentHeight])

  const transitionCreatorContentHeight = useCallback((): void => {
    if (!visible) return

    setIsContentHeightTransitioning(true)
    pendingContentVisibleRef.current = false
    clearContentTransitionTimer()
    clearContentHeightFrame()
    lockCreatorContentHeight()

    contentHeightFrameRef.current = window.requestAnimationFrame(() => {
      contentHeightFrameRef.current = window.requestAnimationFrame(() => {
        contentHeightFrameRef.current = null
        const nextHeight = readCreatorContentHeight()
        if (nextHeight <= 0) {
          setIsContentHeightTransitioning(false)
          return
        }

        setIsContentVisible(false)
        pendingContentVisibleRef.current = true
        void contentShellRef.current?.offsetHeight
        animateCreatorContentHeightTo(nextHeight)
        contentTransitionTimerRef.current = window.setTimeout(
          finishPendingContentTransition,
          CONTENT_HEIGHT_TRANSITION_FALLBACK_MS
        )
      })
    })
  }, [
    animateCreatorContentHeightTo,
    clearContentHeightFrame,
    clearContentTransitionTimer,
    finishPendingContentTransition,
    lockCreatorContentHeight,
    readCreatorContentHeight,
    visible
  ])

  const handleContentShellTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>): void => {
      if (
        event.target !== contentShellRef.current ||
        event.propertyName !== 'height' ||
        !isContentHeightTransitioning
      ) {
        return
      }

      setIsContentHeightTransitioning(false)

      if (pendingContentVisibleRef.current) {
        finishPendingContentTransition()
        return
      }

      clearContentTransitionTimer()
    },
    [clearContentTransitionTimer, finishPendingContentTransition, isContentHeightTransitioning]
  )

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false
      return
    }

    if (wasVisibleRef.current) return
    wasVisibleRef.current = true

    const creatorState = useLabCreatorStore.getState()
    const containerState = useContainerStore.getState()
    const configState = useDockerConfigStore.getState()
    const initialCreateType = dockerStatus?.available === false ? 'ssh' : 'compose'

    setIsContentMeasured(false)
    setIsContentVisible(false)
    creatorState.setCreateType(initialCreateType)
    creatorState.setComposeContent(creatorState.getComposeTemplate('mixed'))
    creatorState.setDockerfileContent(
      `FROM node:18-alpine\n\nWORKDIR /app\n\nCOPY package*.json ./\nRUN npm install\n\nCOPY . .\n\nEXPOSE 3000\n\nCMD ["npm", "start"]\n`
    )
    creatorState.setDockerfileContext('')
    creatorState.setComposeProjectName('')
    creatorState.setDockerfileProjectName('')
    creatorState.setSelectedComposeId(null)
    creatorState.setSelectedDockerfileId(null)
    creatorState.resetSshConfig()
    creatorState.clearCreateError()

    void Promise.all([
      containerState.loadContainers(),
      configState.loadDockerfileConfigs(),
      configState.loadComposeConfigs()
    ])
  }, [dockerStatus?.available, visible])

  useEffect(() => {
    if (!visible || dockerStatus?.available !== false) return

    const creatorState = useLabCreatorStore.getState()
    if (DOCKER_CREATE_TYPES.has(creatorState.createType)) {
      creatorState.setCreateType('ssh')
    }
  }, [dockerStatus?.available, visible])

  useEffect(() => {
    if (visible) {
      initializeCreatorContentHeight()
    }
  }, [initializeCreatorContentHeight, visible])

  useEffect(() => {
    return () => {
      contentResizeObserverRef.current?.disconnect()
      clearContentHeightFrame()
      clearContentResizeFrame()
      clearContentTransitionTimer()
    }
  }, [clearContentHeightFrame, clearContentResizeFrame, clearContentTransitionTimer])

  async function handleSaveConfig(name: string): Promise<void> {
    useLabCreatorStore.setState({ saveConfigName: name.trim() })
    await creatorStore.handleSaveConfig()
  }

  async function testSshConnection(): Promise<void> {
    const ssh = creatorStore.sshConfig
    if (!ssh?.host?.trim() || !ssh?.username?.trim()) {
      notify.warning('请填写必填项', '主机地址和用户名不能为空', { source: 'lab' })
      return
    }
    setIsTestingSsh(true)
    try {
      const result = await window.api.ssh.config.test(
        {
          id: '',
          name: 'test',
          host: ssh.host,
          port: ssh.port,
          username: ssh.username,
          authType: ssh.authType,
          keyName: ssh.authType === 'key' ? ssh.keyName : undefined,
          keyContent: ssh.authType === 'key' ? ssh.keyContent : undefined
        },
        ssh.authType === 'password' ? ssh.password : undefined
      )
      if (result.success) notify.success('连接成功', undefined, { source: 'lab' })
      else notify.error('连接失败', result.error || '未知错误', { source: 'lab' })
    } finally {
      setIsTestingSsh(false)
    }
  }

  // 从各 store 获取响应式数据
  const createType = creatorStore.createType || 'compose'
  const showSaveDialog = creatorStore.showSaveDialog || false
  const isCreating = creatorStore.isCreating || false
  const createError = creatorStore.createError || ''
  const createPhaseText = creatorStore.getCreatePhaseText() || ''
  const createProgress = creatorStore.getCreateProgress()
  const containerSelectHint = creatorStore.getContainerSelectHint()
  const canCreate = creatorStore.getCanCreate()
  const composeContent = composeConfigStore.composeContent || ''
  const composeProjectName = composeConfigStore.composeProjectName || ''
  const dockerfileContent = dockerfileConfigStore.dockerfileContent || ''
  const dockerfileContext = dockerfileConfigStore.dockerfileContext || ''
  const dockerfileProjectName = dockerfileConfigStore.dockerfileProjectName || ''
  const portMappings = usePortMappingStore((s) => s.portMappings)
  const sshConfig = creatorStore.sshConfig

  const renderPortMappingSection = (type: 'compose' | 'dockerfile') => (
    <PortMappingSection
      createType={type}
      portMappings={portMappings}
      onRefresh={() => creatorStore.refreshPorts()}
      onAdd={() => creatorStore.addPortMapping()}
      onUpdate={(i, p) => creatorStore.updatePortMapping(i, p)}
      onRemove={(i) => creatorStore.removePortMapping(i)}
    />
  )

  useLayoutEffect(() => {
    if (!visible || !isContentMeasured) return
    transitionCreatorContentHeight()
  }, [
    containerSelectHint,
    createError,
    createType,
    isContentMeasured,
    isCreating,
    portMappings.length,
    sshConfig?.authType,
    transitionCreatorContentHeight,
    visible
  ])

  return (
    <CssTransition name="sm-modal" show={visible} appear>
      {({ className, ref }) => (
        <div
          ref={ref}
          className={['sm-modal__overlay', 'lab-creator-overlay', className]
            .filter(Boolean)
            .join(' ')}
          onClick={onClose}
        >
          <div
            ref={creatorRef}
            className="sm-modal__surface lab-creator"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="creator-header">
              <h2>创建实验室</h2>
              <button className="close-btn" onClick={onClose}>
                ×
              </button>
            </div>

            <CreateTypeSelector
              createType={createType}
              dockerReady={dockerStatus?.available ?? true}
              onChange={(t) => {
                creatorStore.setCreateType(t)
              }}
            />

            <div
              ref={contentShellRef}
              className={['creator-content-shell', isContentMeasured && 'is-measured']
                .filter(Boolean)
                .join(' ')}
              onTransitionEnd={handleContentShellTransitionEnd}
            >
              <div
                ref={contentInnerRef}
                className={['creator-content-inner', isContentVisible && 'is-visible']
                  .filter(Boolean)
                  .join(' ')}
              >
                {createType === 'existing' && <ContainerSelector />}

                {containerSelectHint && <div className="container-hint">{containerSelectHint}</div>}

                {isCreating && (
                  <div className="create-progress">
                    <div className="progress-header">
                      <span className="progress-text">{createPhaseText}</span>
                      <span className="progress-percent">{createProgress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${createProgress}%` }}></div>
                    </div>
                  </div>
                )}

                {createError && !isCreating && (
                  <div className="create-error">
                    <div className="error-header">
                      <span className="error-icon">⚠</span>
                      <span className="error-title">创建失败</span>
                      <button className="error-close" onClick={clearCreateError}>
                        ×
                      </button>
                    </div>
                    <div className="error-message">{createError}</div>
                  </div>
                )}

                {createType === 'compose' && (
                  <ComposeEditor
                    modelValue={composeContent}
                    projectName={composeProjectName}
                    onUpdateModelValue={(v) => {
                      creatorStore.setComposeContent(v)
                    }}
                    onUpdateProjectName={(v) => {
                      creatorStore.setComposeProjectName(v)
                    }}
                    onSaveConfig={() => {
                      creatorStore.openSaveDialog('compose')
                    }}
                  />
                )}

                {createType === 'dockerfile' && (
                  <>
                    <div className="project-name-section">
                      <label className="form-label">
                        实验室名称 <span className="required">*</span>
                      </label>
                      <input
                        value={dockerfileProjectName}
                        type="text"
                        className="form-input"
                        placeholder="请输入实验室名称"
                        onChange={(e) => {
                          creatorStore.setDockerfileProjectName(e.target.value)
                        }}
                      />
                    </div>
                    <DockerfileEditor
                      modelValue={dockerfileContent}
                      context={dockerfileContext}
                      onUpdateModelValue={(v) => {
                        creatorStore.setDockerfileContent(v)
                      }}
                      onUpdateContext={(v) => {
                        creatorStore.setDockerfileContext(v)
                      }}
                      onSaveConfig={() => {
                        creatorStore.openSaveDialog('dockerfile')
                      }}
                    />
                  </>
                )}

                {createType === 'ssh' && (
                  <div className={`${styles['ssh-form']} creator-section`}>
                    <div className={styles['ssh-form__field']}>
                      <label className="form-label">
                        主机地址 <span className="required">*</span>
                      </label>
                      <input
                        value={sshConfig?.host || ''}
                        type="text"
                        className="form-input"
                        placeholder="192.168.1.100"
                        onChange={(e) => creatorStore.updateSshConfig({ host: e.target.value })}
                      />
                    </div>
                    <div
                      className={`${styles['ssh-form__field']} ${styles['ssh-form__field--inline']}`}
                    >
                      <div className={styles['ssh-form__field-half']}>
                        <label className="form-label">端口</label>
                        <input
                          value={sshConfig?.port || 22}
                          type="number"
                          className="form-input"
                          placeholder="22"
                          onChange={(e) =>
                            creatorStore.updateSshConfig({ port: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className={styles['ssh-form__field-half']}>
                        <label className="form-label">
                          用户名 <span className="required">*</span>
                        </label>
                        <input
                          value={sshConfig?.username || ''}
                          type="text"
                          className="form-input"
                          placeholder="root"
                          onChange={(e) =>
                            creatorStore.updateSshConfig({ username: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className={styles['ssh-form__field']}>
                      <label className="form-label">认证方式</label>
                      <div className={styles['ssh-form__toggle']}>
                        <button
                          className={[
                            styles['ssh-form__toggle-btn'],
                            sshConfig?.authType === 'password' && styles.active
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => creatorStore.updateSshConfig({ authType: 'password' })}
                        >
                          密码
                        </button>
                        <button
                          className={[
                            styles['ssh-form__toggle-btn'],
                            sshConfig?.authType === 'key' && styles.active
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => creatorStore.updateSshConfig({ authType: 'key' })}
                        >
                          密钥
                        </button>
                      </div>
                    </div>

                    {sshConfig?.authType === 'password' ? (
                      <div className={styles['ssh-form__field']}>
                        <label className="form-label">密码</label>
                        <input
                          value={sshConfig?.password || ''}
                          type="password"
                          className="form-input"
                          placeholder="输入 SSH 密码"
                          onChange={(e) =>
                            creatorStore.updateSshConfig({ password: e.target.value })
                          }
                        />
                      </div>
                    ) : (
                      <>
                        <div className={styles['ssh-form__field']}>
                          <label className="form-label">
                            密钥名称 <span className="required">*</span>
                          </label>
                          <input
                            value={sshConfig?.keyName || ''}
                            type="text"
                            className="form-input"
                            placeholder="my-key"
                            onChange={(e) =>
                              creatorStore.updateSshConfig({ keyName: e.target.value })
                            }
                          />
                        </div>
                        <div className={styles['ssh-form__field']}>
                          <label className="form-label">
                            密钥内容 <span className="required">*</span>
                          </label>
                          <textarea
                            value={sshConfig?.keyContent || ''}
                            className={`form-input ${styles['ssh-form__key-textarea']}`}
                            placeholder={
                              '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'
                            }
                            rows={6}
                            onChange={(e) =>
                              creatorStore.updateSshConfig({ keyContent: e.target.value })
                            }
                          ></textarea>
                        </div>
                      </>
                    )}
                    <button
                      className={styles['ssh-form__test-btn']}
                      disabled={isTestingSsh}
                      onClick={testSshConnection}
                    >
                      {isTestingSsh ? '测试连接中...' : '测试连接'}
                    </button>
                  </div>
                )}
              </div>
            </div>
            {(createType === 'compose' || createType === 'dockerfile') &&
              renderPortMappingSection(createType)}

            <CreateActions
              createType={createType}
              isCreating={isCreating}
              canCreate={canCreate}
              createPhaseText={createPhaseText}
              onClose={onClose}
              onCreate={async () => {
                const created = await creatorStore.handleCreate()
                if (created) onClose()
              }}
            />

            <SaveConfigDialog
              visible={showSaveDialog}
              onClose={() => {
                creatorStore.closeSaveDialog()
              }}
              onSave={handleSaveConfig}
            />
          </div>
        </div>
      )}
    </CssTransition>
  )
}
