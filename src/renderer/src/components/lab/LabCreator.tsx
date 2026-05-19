import { useEffect, useState } from 'react'
import { useContainerStoreReact, useLabCreatorStoreReact } from '@renderer/stores/lab/reactAdapters'
import { useDockerConfigStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import ContainerSelector from './ContainerSelector'
import ComposeEditor from './ComposeEditor'
import DockerfileEditor from './DockerfileEditor'
import SaveConfigDialog from './SaveConfigDialog'
import CreateTypeSelector from './creator/CreateTypeSelector'
import CreateActions from './creator/CreateActions'
import PortMappingSection from './creator/PortMappingSection'
import type { DockerStatus } from '@renderer/types/lab'
import styles from './LabCreator.module.css'

interface LabCreatorProps {
  visible: boolean
  dockerStatus?: DockerStatus | null
  onClose: () => void
}

export default function LabCreator({ visible, dockerStatus, onClose }: LabCreatorProps) {
  const containerStore = useContainerStoreReact()
  const configStore = useDockerConfigStore()
  const creatorStore = useLabCreatorStoreReact()
  const notify = useNotification()

  const [isTestingSsh, setIsTestingSsh] = useState(false)

  useEffect(() => {
    if (!visible) return

    creatorStore.createType = 'compose'
    creatorStore.composeContent = creatorStore.getComposeTemplate('mixed')
    creatorStore.dockerfileContent = `FROM node:18-alpine\n\nWORKDIR /app\n\nCOPY package*.json ./\nRUN npm install\n\nCOPY . .\n\nEXPOSE 3000\n\nCMD ["npm", "start"]\n`
    creatorStore.dockerfileContext = ''
    creatorStore.composeProjectName = ''
    creatorStore.dockerfileProjectName = ''
    creatorStore.resetSshConfig()
    creatorStore.clearError()

    Promise.all([
      containerStore.loadContainers(),
      configStore.loadDockerfileConfigs(),
      configStore.loadComposeConfigs()
    ])
  }, [visible])

  async function handleSaveConfig(name: string): Promise<void> {
    creatorStore.saveConfigName = name.trim()
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

  const createType = creatorStore.createType || 'compose'
  const showSaveDialog = creatorStore.showSaveDialog || false
  const isCreating = creatorStore.isCreating || false
  const createError = creatorStore.createError || ''
  const createPhaseText = creatorStore.createPhaseText || ''

  if (!visible) return null

  return (
    <div className="sm-modal__overlay lab-creator-overlay" onClick={onClose}>
      <div className="sm-modal__surface lab-creator" onClick={(e) => e.stopPropagation()}>
        <div className="creator-header">
          <h2>创建新实验室</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <CreateTypeSelector
          createType={createType}
          dockerReady={dockerStatus?.available ?? true}
          onChange={(t) => {
            creatorStore.createType = t
          }}
        />

        <div className={`${styles['creator-content']} creator-content-shell`}>
          <div className="creator-content-inner">
            {createType === 'existing' && (
              <ContainerSelector
                containers={containerStore.containers || []}
                onSelect={(containerId) => {
                  creatorStore.selectedContainerId = containerId
                }}
              />
            )}

            {isCreating && (
              <div className="create-progress">
                <div className="progress-header">
                  <span className="progress-text">{createPhaseText}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: '50%' }}></div>
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
                    onClick={() => { creatorStore.clearError() }}
                  >
                    ×
                  </button>
                </div>
                <div className="error-message">{createError}</div>
              </div>
            )}

            {createType === 'compose' && (
              <ComposeEditor
                modelValue={creatorStore.composeContent || ''}
                projectName={creatorStore.composeProjectName}
                onUpdateModelValue={(v) => {
                  creatorStore.composeContent = v
                }}
                onUpdateProjectName={(v) => {
                  creatorStore.composeProjectName = v
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
                    value={creatorStore.dockerfileProjectName || ''}
                    type="text"
                    className="form-input"
                    placeholder="请输入实验室名称"
                    onChange={(e) => {
                      creatorStore.dockerfileProjectName = e.target.value
                    }}
                  />
                </div>
                <DockerfileEditor
                  modelValue={creatorStore.dockerfileContent || ''}
                  context={creatorStore.dockerfileContext || ''}
                  onUpdateModelValue={(v) => {
                    creatorStore.dockerfileContent = v
                  }}
                  onUpdateContext={(v) => {
                    creatorStore.dockerfileContext = v
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
                    value={creatorStore.sshConfig?.host || ''}
                    type="text"
                    className="form-input"
                    placeholder="192.168.1.100"
                    onChange={(e) => creatorStore.updateSshConfig?.({ host: e.target.value })}
                  />
                </div>
                <div
                  className={`${styles['ssh-form__field']} ${styles['ssh-form__field--inline']}`}
                >
                  <div className={styles['ssh-form__field-half']}>
                    <label className="form-label">端口</label>
                    <input
                      value={creatorStore.sshConfig?.port || 22}
                      type="number"
                      className="form-input"
                      placeholder="22"
                      onChange={(e) =>
                        creatorStore.updateSshConfig?.({ port: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className={styles['ssh-form__field-half']}>
                    <label className="form-label">
                      用户名 <span className="required">*</span>
                    </label>
                    <input
                      value={creatorStore.sshConfig?.username || ''}
                      type="text"
                      className="form-input"
                      placeholder="root"
                      onChange={(e) => creatorStore.updateSshConfig?.({ username: e.target.value })}
                    />
                  </div>
                </div>
                <button
                  className={styles['ssh-form__test-btn']}
                  disabled={isTestingSsh}
                  onClick={testSshConnection}
                >
                  {isTestingSsh ? '测试连接中...' : '测试连接'}
                </button>
              </div>
            )}

            {createType !== 'ssh' && (
              <PortMappingSection
                portMappings={creatorStore.portMappings}
                onRefresh={() => creatorStore.refreshPorts?.()}
                onAdd={() => creatorStore.addPortMapping?.()}
                onUpdate={(i, p) =>
                  creatorStore.updatePortMapping?.(i, p as Record<string, unknown>)
                }
                onRemove={(i) => creatorStore.removePortMapping?.(i)}
              />
            )}

            <CreateActions
              isCreating={isCreating}
              canCreate={creatorStore.canCreate}
              createPhaseText={createPhaseText}
              onClose={onClose}
              onCreate={() => creatorStore.handleCreate()}
            />
          </div>
        </div>

        <SaveConfigDialog
          visible={showSaveDialog}
          onClose={() => {
            creatorStore.closeSaveDialog()
          }}
          onSave={handleSaveConfig}
        />
      </div>
    </div>
  )
}
