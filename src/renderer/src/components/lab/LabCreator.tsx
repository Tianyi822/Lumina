import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLabCreatorStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { CssTransition } from '@renderer/components/motion/CssTransition'
import ModalPortal from '@renderer/components/ui/ModalPortal'
import { useContentHeightAnimation } from './hooks/useContentHeightAnimation'
import styles from './LabCreator.module.css'

/** SSH 连接创建对话框，提供表单填写主机/端口/认证信息并测试连接 */
interface LabCreatorProps {
  visible: boolean
  onClose: () => void
}

export default function LabCreator({ visible, onClose }: LabCreatorProps) {
  const creatorStore = useLabCreatorStore()
  const notify = useNotification()

  const [isTestingSsh, setIsTestingSsh] = useState(false)
  // 记录上一个 visible 状态，避免重复初始化
  const wasVisibleRef = useRef(false)

  const {
    creatorRef,
    contentShellRef,
    contentInnerRef,
    isContentMeasured,
    isContentVisible,
    handleContentShellTransitionEnd,
    requestHeightTransition
  } = useContentHeightAnimation(visible)

  // 对话框打开时初始化 SSH 表单状态，关闭时重置跟踪标记
  useEffect(() => {
    if (!visible) {
      // 对话框关闭时，重置标记使下次打开时重新初始化
      wasVisibleRef.current = false
      return
    }

    // 首次打开时才初始化表单，避免重复覆盖用户已编辑的内容
    if (wasVisibleRef.current) return
    wasVisibleRef.current = true

    const creatorState = useLabCreatorStore.getState()
    creatorState.setCreateType('ssh')
    creatorState.resetSshConfig()
    creatorState.clearCreateError()
  }, [visible])

  /** 测试 SSH 连接有效性，连接成功/失败均通过通知反馈 */
  async function testSshConnection(): Promise<void> {
    const ssh = creatorStore.sshConfig
    if (!ssh?.host?.trim() || !ssh?.username?.trim()) {
      notify.warning('请填写必填项', '主机地址和用户名不能为空', { source: 'lab' })
      return
    }
    setIsTestingSsh(true)
    try {
      // 根据认证方式组装参数：密钥认证携带 keyName/keyContent，密码认证携带 password
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

  const createError = creatorStore.createError || ''
  const isCreating = creatorStore.isCreating || false
  const createPhaseText = creatorStore.getCreatePhaseText() || ''
  const createProgress = creatorStore.getCreateProgress()
  const canCreate = creatorStore.getCanCreate()
  const sshConfig = creatorStore.sshConfig

  // 内容变化时触发高度过渡动画（错误提示/认证方式切换等）
  useLayoutEffect(() => {
    if (!visible || !isContentMeasured) return
    requestHeightTransition()
  }, [createError, isContentMeasured, isCreating, sshConfig?.authType, requestHeightTransition, visible])

  return (
    <CssTransition name="sm-modal" show={visible} appear>
      {({ className, ref }) => (
        <ModalPortal
          ref={ref}
          className={[styles.overlay, className].filter(Boolean).join(' ')}
          onBackdropClick={isCreating ? undefined : onClose}
        >
          <div
            ref={creatorRef}
            className={`sm-modal__surface ${styles.dialog}`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className={`sm-pane-header ${styles.header}`}>
              <h2>SSH 连接</h2>
              <button
                type="button"
                className="sm-icon-button"
                aria-label="关闭"
                disabled={isCreating}
                onClick={onClose}
              >
                ✕
              </button>
            </header>

            <div
              ref={contentShellRef}
              className={styles['content-shell']}
              onTransitionEnd={handleContentShellTransitionEnd}
            >
              <div
                ref={contentInnerRef}
                className={[
                  styles['content-inner'],
                  isContentVisible && styles['content-inner-visible']
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isCreating && (
                  <div className={styles['create-progress']}>
                    <div className={styles['progress-header']}>
                      <span className={styles['progress-text']}>{createPhaseText}</span>
                      <span className={styles['progress-percent']}>{createProgress}%</span>
                    </div>
                    <div className={styles['progress-bar']}>
                      <div
                        className={styles['progress-fill']}
                        style={{ width: `${createProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {createError && !isCreating && (
                  <div className={styles['create-error']}>
                    <div className={styles['error-header']}>
                      <span aria-hidden="true">⚠</span>
                      <span className={styles['error-title']}>创建失败</span>
                      <button
                        type="button"
                        className={styles['error-close']}
                        aria-label="关闭错误提示"
                        onClick={() => creatorStore.clearCreateError()}
                      >
                        ×
                      </button>
                    </div>
                    <div className={styles['error-message']}>{createError}</div>
                  </div>
                )}

                <div className={styles['form-body']}>
                  <div className="form-group">
                    <label htmlFor="ssh-host">
                      主机地址 <span className={styles.required}>*</span>
                    </label>
                    <input
                      id="ssh-host"
                      value={sshConfig?.host || ''}
                      type="text"
                      className="sm-input"
                      placeholder="192.168.1.100"
                      onChange={(e) => creatorStore.updateSshConfig({ host: e.target.value })}
                    />
                  </div>

                  <div className={styles['field-row']}>
                    <div className="form-group">
                      <label htmlFor="ssh-port">端口</label>
                      <input
                        id="ssh-port"
                        value={sshConfig?.port || 22}
                        type="number"
                        className="sm-input"
                        placeholder="22"
                        onChange={(e) =>
                          creatorStore.updateSshConfig({ port: Number(e.target.value) })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="ssh-username">
                        用户名 <span className={styles.required}>*</span>
                      </label>
                      <input
                        id="ssh-username"
                        value={sshConfig?.username || ''}
                        type="text"
                        className="sm-input"
                        placeholder="root"
                        onChange={(e) =>
                          creatorStore.updateSshConfig({ username: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label id="ssh-auth-type-label">认证方式</label>
                    <div
                      className={styles['auth-toggle']}
                      role="radiogroup"
                      aria-labelledby="ssh-auth-type-label"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={sshConfig?.authType === 'password'}
                        className={[
                          styles['auth-toggle-btn'],
                          sshConfig?.authType === 'password' && styles['auth-toggle-btn-active']
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => creatorStore.updateSshConfig({ authType: 'password' })}
                      >
                        密码
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={sshConfig?.authType === 'key'}
                        className={[
                          styles['auth-toggle-btn'],
                          sshConfig?.authType === 'key' && styles['auth-toggle-btn-active']
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
                    <div className="form-group">
                      <label htmlFor="ssh-password">密码</label>
                      <input
                        id="ssh-password"
                        value={sshConfig?.password || ''}
                        type="password"
                        className="sm-input"
                        placeholder="输入 SSH 密码"
                        onChange={(e) =>
                          creatorStore.updateSshConfig({ password: e.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <div className="form-group">
                        <label htmlFor="ssh-key-name">
                          密钥名称 <span className={styles.required}>*</span>
                        </label>
                        <input
                          id="ssh-key-name"
                          value={sshConfig?.keyName || ''}
                          type="text"
                          className="sm-input"
                          placeholder="my-key"
                          onChange={(e) =>
                            creatorStore.updateSshConfig({ keyName: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="ssh-key-content">
                          密钥内容 <span className={styles.required}>*</span>
                        </label>
                        <textarea
                          id="ssh-key-content"
                          value={sshConfig?.keyContent || ''}
                          className={`sm-textarea ${styles['key-textarea']}`}
                          placeholder={
                            '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'
                          }
                          rows={6}
                          onChange={(e) =>
                            creatorStore.updateSshConfig({ keyContent: e.target.value })
                          }
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="button"
                    className={`sm-button sm-button--secondary ${styles['test-btn']}`}
                    disabled={isTestingSsh}
                    onClick={testSshConnection}
                  >
                    {isTestingSsh ? '测试连接中...' : '测试连接'}
                  </button>
                </div>
              </div>
            </div>

            <div className={`form-actions with-border ${styles.actions}`}>
              <button
                type="button"
                className="sm-button sm-button--secondary"
                onClick={onClose}
                disabled={isCreating}
              >
                取消
              </button>
              <button
                type="button"
                className="sm-button sm-button--primary"
                disabled={!canCreate || isCreating}
                onClick={() => void creatorStore.handleCreate()}
              >
                {isCreating ? createPhaseText || '创建中...' : '创建连接'}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}
    </CssTransition>
  )
}
