import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLabCreatorStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { CssTransition } from '@renderer/components/motion/CssTransition'
import ModalPortal from '@renderer/components/ui/ModalPortal'
import { useContentHeightAnimation } from './hooks/useContentHeightAnimation'
import styles from './LabCreator.module.css'

interface LabCreatorProps {
  visible: boolean
  onClose: () => void
}

export default function LabCreator({ visible, onClose }: LabCreatorProps) {
  const creatorStore = useLabCreatorStore()
  const notify = useNotification()

  const [isTestingSsh, setIsTestingSsh] = useState(false)
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

  useEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false
      return
    }

    if (wasVisibleRef.current) return
    wasVisibleRef.current = true

    const creatorState = useLabCreatorStore.getState()
    creatorState.setCreateType('ssh')
    creatorState.resetSshConfig()
    creatorState.clearCreateError()
  }, [visible])

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

  const createError = creatorStore.createError || ''
  const isCreating = creatorStore.isCreating || false
  const createPhaseText = creatorStore.getCreatePhaseText() || ''
  const createProgress = creatorStore.getCreateProgress()
  const canCreate = creatorStore.getCanCreate()
  const sshConfig = creatorStore.sshConfig

  useLayoutEffect(() => {
    if (!visible || !isContentMeasured) return
    requestHeightTransition()
  }, [createError, isContentMeasured, isCreating, sshConfig?.authType, requestHeightTransition, visible])

  return (
    <CssTransition name="sm-modal" show={visible} appear>
      {({ className, ref }) => (
        <ModalPortal
          ref={ref}
          className={['lab-creator-overlay', className].filter(Boolean).join(' ')}
        >
          <div
            ref={creatorRef}
            className="sm-modal__surface lab-creator"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="creator-header">
              <h2>SSH 连接</h2>
              <button className="close-btn" onClick={onClose}>
                ×
              </button>
            </div>

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
                      <button
                        className="error-close"
                        onClick={() => creatorStore.clearCreateError()}
                      >
                        ×
                      </button>
                    </div>
                    <div className="error-message">{createError}</div>
                  </div>
                )}

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
                    <label className="form-label" id="ssh-auth-type-label">
                      认证方式
                    </label>
                    <div
                      className={styles['ssh-form__toggle']}
                      role="radiogroup"
                      aria-labelledby="ssh-auth-type-label"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={sshConfig?.authType === 'password'}
                        className={[
                          styles['ssh-form__toggle-btn'],
                          sshConfig?.authType === 'password' && styles['ssh-form__toggle-btn--active']
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
                          styles['ssh-form__toggle-btn'],
                          sshConfig?.authType === 'key' && styles['ssh-form__toggle-btn--active']
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
                    className={[
                      'sm-button',
                      'sm-button--secondary',
                      styles['ssh-form__test-btn']
                    ].join(' ')}
                    disabled={isTestingSsh}
                    onClick={testSshConnection}
                  >
                    {isTestingSsh ? '测试连接中...' : '测试连接'}
                  </button>
                </div>
              </div>
            </div>

            <div className="creator-actions">
              <button
                className="sm-button sm-button--secondary"
                onClick={onClose}
                disabled={isCreating}
              >
                取消
              </button>
              <button
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
