<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useContainerStore, useDockerConfigStore, useLabCreatorStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import ContainerSelector from './ContainerSelector.vue'
import ComposeEditor from './ComposeEditor.vue'
import DockerfileEditor from './DockerfileEditor.vue'
import SaveConfigDialog from './SaveConfigDialog.vue'
import { CreateActions, CreateTypeSelector, PortMappingSection } from './creator'
import { useCreateFlow } from './creator/composables/useCreateFlow'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const containerStore = useContainerStore()
const configStore = useDockerConfigStore()
const creatorStore = useLabCreatorStore()
const notify = useNotification()

const {
  showSaveDialog,
  saveDialogType,
  isCreating,
  createError,
  portMappings,
  createType,
  composeContent,
  composeProjectName,
  dockerfileContent,
  dockerfileContext,
  dockerfileProjectName,
  sshConfig
} = storeToRefs(creatorStore)

const containerSelectorRef = ref<InstanceType<typeof ContainerSelector> | null>(null)
const creatorRef = ref<HTMLElement | null>(null)
const contentShellRef = ref<HTMLElement | null>(null)
const contentInnerRef = ref<HTMLElement | null>(null)
const isContentMeasured = ref(false)
const isContentVisible = ref(true)
const isContentHeightTransitioning = ref(false)
const isTestingSsh = ref(false)
let contentResizeObserver: ResizeObserver | null = null
let contentHeightAnimationFrame: number | null = null
let pendingContentVisible = false
let contentTransitionTimer: number | null = null

const CONTENT_HEIGHT_TRANSITION_MS = 220
const CONTENT_HEIGHT_TRANSITION_FALLBACK_MS = CONTENT_HEIGHT_TRANSITION_MS + 80

function clearContentHeightAnimationFrame(): void {
  if (contentHeightAnimationFrame !== null) {
    window.cancelAnimationFrame(contentHeightAnimationFrame)
    contentHeightAnimationFrame = null
  }
}

function clearContentTransitionTimer(): void {
  if (contentTransitionTimer !== null) {
    window.clearTimeout(contentTransitionTimer)
    contentTransitionTimer = null
  }
}

function animateCreatorContentHeightTo(nextHeight: number): void {
  clearContentHeightAnimationFrame()
  contentHeightAnimationFrame = window.requestAnimationFrame(() => {
    contentHeightAnimationFrame = null
    setCreatorContentHeight(nextHeight)
  })
}

function finishPendingContentTransition(): void {
  if (!pendingContentVisible) {
    return
  }

  pendingContentVisible = false
  isContentHeightTransitioning.value = false
  isContentVisible.value = true
  clearContentTransitionTimer()
}

function handleContentShellTransitionEnd(event: TransitionEvent): void {
  if (
    event.target !== contentShellRef.value ||
    event.propertyName !== 'height' ||
    !isContentHeightTransitioning.value
  ) {
    return
  }

  isContentHeightTransitioning.value = false

  if (pendingContentVisible) {
    finishPendingContentTransition()
    return
  }

  clearContentTransitionTimer()
}

function readCreatorContentAvailableHeight(): number {
  const creator = creatorRef.value
  const shell = contentShellRef.value
  if (!creator || !shell) {
    return Number.POSITIVE_INFINITY
  }

  const creatorStyles = window.getComputedStyle(creator)
  const creatorRect = creator.getBoundingClientRect()
  const shellRect = shell.getBoundingClientRect()
  const maxHeightValue = creatorStyles.maxHeight
  const maxCreatorHeight = maxHeightValue.endsWith('vh')
    ? (window.innerHeight * parseFloat(maxHeightValue)) / 100
    : parseFloat(maxHeightValue)
  const creatorHeightLimit = Number.isFinite(maxCreatorHeight)
    ? maxCreatorHeight
    : creator.clientHeight
  const shellTop = shellRect.top - creatorRect.top

  return Math.max(1, Math.floor(creatorHeightLimit - shellTop))
}

function readCreatorContentHeight(): number {
  const shell = contentShellRef.value
  const inner = contentInnerRef.value
  if (!inner) {
    return 0
  }

  if (!shell) {
    return Math.ceil(inner.scrollHeight)
  }

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
}

function setCreatorContentHeight(height: number): void {
  const shell = contentShellRef.value
  if (!shell || height <= 0) {
    return
  }

  isContentMeasured.value = true
  shell.style.height = `${Math.min(height, readCreatorContentAvailableHeight())}px`
}

function lockCreatorContentHeight(): void {
  const shell = contentShellRef.value
  if (!shell) {
    return
  }

  setCreatorContentHeight(Math.ceil(shell.offsetHeight))
  void shell.offsetHeight
}

function syncCreatorContentHeight(): void {
  const nextHeight = readCreatorContentHeight()
  if (nextHeight <= 0) {
    return
  }

  lockCreatorContentHeight()
  clearContentHeightAnimationFrame()
  contentHeightAnimationFrame = window.requestAnimationFrame(() => {
    contentHeightAnimationFrame = null
    setCreatorContentHeight(nextHeight)
  })
}

async function transitionCreatorContentHeight(): Promise<void> {
  if (!props.visible) {
    return
  }

  isContentHeightTransitioning.value = true

  pendingContentVisible = false
  clearContentTransitionTimer()
  clearContentHeightAnimationFrame()

  lockCreatorContentHeight()

  await nextTick()

  // 等待浏览器完成布局计算（ContainerSelector 等复杂组件需要）
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })

  const nextHeight = readCreatorContentHeight()
  if (nextHeight <= 0) {
    isContentHeightTransitioning.value = false
    return
  }

  isContentVisible.value = false
  pendingContentVisible = true

  await nextTick()

  void contentShellRef.value?.offsetHeight

  animateCreatorContentHeightTo(nextHeight)

  contentTransitionTimer = window.setTimeout(
    finishPendingContentTransition,
    CONTENT_HEIGHT_TRANSITION_FALLBACK_MS
  )
}

function observeCreatorContent(): void {
  contentResizeObserver?.disconnect()

  if (typeof ResizeObserver === 'undefined' || !contentInnerRef.value) {
    return
  }

  contentResizeObserver = new ResizeObserver(() => {
    if (props.visible && isContentVisible.value && !isContentHeightTransitioning.value) {
      syncCreatorContentHeight()
    }
  })
  contentResizeObserver.observe(contentInnerRef.value)
}

async function initializeCreatorContentHeight(): Promise<void> {
  await nextTick()

  // 等待浏览器完成布局计算
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })

  observeCreatorContent()
  syncCreatorContentHeight()
  isContentVisible.value = true
}

const {
  canCreate,
  containerSelectHint,
  createPhaseText,
  createProgress,
  clearError,
  close,
  handleCreate
} = useCreateFlow({
  containerSelectorRef,
  closeDialog: () => emit('close')
})

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      return
    }

    createType.value = 'compose'
    composeContent.value = creatorStore.getComposeTemplate('mixed')
    dockerfileContent.value = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`
    dockerfileContext.value = ''
    composeProjectName.value = ''
    dockerfileProjectName.value = ''
    creatorStore.resetSshConfig()
    containerSelectorRef.value?.reset()
    clearError()

    await Promise.all([
      containerStore.loadContainers(),
      configStore.loadDockerfileConfigs(),
      configStore.loadComposeConfigs()
    ])

    await initializeCreatorContentHeight()
  }
)

watch(createType, async (newType) => {
  if (newType === 'existing' && containerStore.containers.length === 0) {
    await containerStore.loadContainers()
  }

  await transitionCreatorContentHeight()
})

watch(
  () => sshConfig.value.authType,
  async () => {
    await transitionCreatorContentHeight()
  }
)

watch([containerSelectHint, isCreating, createError], async () => {
  await transitionCreatorContentHeight()
})

onBeforeUnmount(() => {
  contentResizeObserver?.disconnect()
  clearContentHeightAnimationFrame()
  clearContentTransitionTimer()
})

async function handleSaveConfig(name: string): Promise<void> {
  creatorStore.saveConfigName = name.trim()
  await creatorStore.handleSaveConfig()
}

async function testSshConnection(): Promise<void> {
  const ssh = sshConfig.value
  if (!ssh.host.trim() || !ssh.username.trim()) {
    notify.warning('请填写必填项', '主机地址和用户名不能为空', { source: 'lab' })
    return
  }

  isTestingSsh.value = true
  try {
    const result = await window.api.ssh.config.test({
      id: '',
      name: 'test',
      host: ssh.host,
      port: ssh.port,
      username: ssh.username,
      authType: ssh.authType,
      password: ssh.authType === 'password' ? ssh.password : undefined,
      keyName: ssh.authType === 'key' ? ssh.keyName : undefined,
      keyContent: ssh.authType === 'key' ? ssh.keyContent : undefined
    })

    if (result.success) {
      const detail = result.systemInfo
        ? `${result.systemInfo.hostname} (${result.systemInfo.platform})`
        : 'SSH 连接测试成功'
      notify.success('连接成功', detail, { source: 'lab' })
    } else {
      notify.error('连接失败', result.error || '未知错误', { source: 'lab' })
    }
  } finally {
    isTestingSsh.value = false
  }
}
</script>

<template>
  <Transition name="sm-modal">
    <div v-if="visible" class="sm-modal__overlay lab-creator-overlay" @click.self="close">
      <div ref="creatorRef" class="sm-modal__surface lab-creator">
        <div class="creator-header">
          <h2>创建新实验室</h2>
          <button class="close-btn" @click="close">×</button>
        </div>

        <CreateTypeSelector v-model="createType" />

        <div
          ref="contentShellRef"
          class="creator-content-shell"
          :class="{ 'is-measured': isContentMeasured }"
          @transitionend="handleContentShellTransitionEnd"
        >
          <div
            ref="contentInnerRef"
            class="creator-content-inner"
            :class="{ 'is-visible': isContentVisible }"
          >
            <ContainerSelector
              v-if="createType === 'existing'"
              ref="containerSelectorRef"
              class="creator-section"
            />

            <div v-if="containerSelectHint" class="container-hint">
              {{ containerSelectHint }}
            </div>

            <div v-if="isCreating" class="create-progress">
              <div class="progress-header">
                <span class="progress-text">{{ createPhaseText }}</span>
                <span class="progress-percent">{{ createProgress }}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${createProgress}%` }"></div>
              </div>
            </div>

            <div v-if="createError && !isCreating" class="create-error">
              <div class="error-header">
                <span class="error-icon">⚠</span>
                <span class="error-title">创建失败</span>
                <button class="error-close" @click="clearError">×</button>
              </div>
              <div class="error-message">{{ createError }}</div>
            </div>

            <ComposeEditor
              v-if="createType === 'compose'"
              v-model="composeContent"
              v-model:project-name="composeProjectName"
              class="creator-section"
              @save-config="creatorStore.openSaveDialog('compose')"
            />

            <template v-else-if="createType === 'dockerfile'">
              <div class="project-name-section">
                <label class="form-label">实验室名称 <span class="required">*</span></label>
                <input
                  v-model="dockerfileProjectName"
                  type="text"
                  class="form-input"
                  placeholder="请输入实验室名称"
                />
              </div>
              <DockerfileEditor
                v-model="dockerfileContent"
                v-model:context="dockerfileContext"
                class="creator-section"
                @save-config="creatorStore.openSaveDialog('dockerfile')"
              />
            </template>

            <div v-else-if="createType === 'ssh'" class="creator-section ssh-form">
              <div class="ssh-form__field">
                <label class="form-label">主机地址 <span class="required">*</span></label>
                <input
                  v-model="sshConfig.host"
                  type="text"
                  class="form-input"
                  placeholder="192.168.1.100"
                />
              </div>

              <div class="ssh-form__field ssh-form__field--inline">
                <div class="ssh-form__field-half">
                  <label class="form-label">端口</label>
                  <input
                    v-model.number="sshConfig.port"
                    type="number"
                    class="form-input"
                    placeholder="22"
                  />
                </div>
                <div class="ssh-form__field-half">
                  <label class="form-label">用户名 <span class="required">*</span></label>
                  <input
                    v-model="sshConfig.username"
                    type="text"
                    class="form-input"
                    placeholder="root"
                  />
                </div>
              </div>

              <div class="ssh-form__field">
                <label class="form-label">认证方式</label>
                <div class="ssh-form__toggle">
                  <button
                    class="ssh-form__toggle-btn"
                    :class="{ active: sshConfig.authType === 'password' }"
                    @click="creatorStore.updateSshConfig({ authType: 'password' })"
                  >
                    密码
                  </button>
                  <button
                    class="ssh-form__toggle-btn"
                    :class="{ active: sshConfig.authType === 'key' }"
                    @click="creatorStore.updateSshConfig({ authType: 'key' })"
                  >
                    密钥
                  </button>
                </div>
              </div>

              <div v-if="sshConfig.authType === 'password'" class="ssh-form__field">
                <label class="form-label">密码</label>
                <input
                  v-model="sshConfig.password"
                  type="password"
                  class="form-input"
                  placeholder="输入 SSH 密码"
                />
              </div>

              <template v-else>
                <div class="ssh-form__field">
                  <label class="form-label">密钥名称 <span class="required">*</span></label>
                  <input
                    v-model="sshConfig.keyName"
                    type="text"
                    class="form-input"
                    placeholder="my-key"
                  />
                </div>
                <div class="ssh-form__field">
                  <label class="form-label">密钥内容 <span class="required">*</span></label>
                  <textarea
                    v-model="sshConfig.keyContent"
                    class="form-input ssh-form__key-textarea"
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                    rows="6"
                  ></textarea>
                </div>
              </template>

              <div class="ssh-form__field ssh-form__checkbox">
                <label>
                  <input v-model="sshConfig.saveConfig" type="checkbox" />
                  保存此服务器配置（密码将加密存储于本地）
                </label>
              </div>

              <button
                class="btn ssh-form__test-btn"
                :disabled="isTestingSsh"
                @click="testSshConnection"
              >
                {{ isTestingSsh ? '测试连接中...' : '测试连接' }}
              </button>
            </div>

            <PortMappingSection
              v-if="createType !== 'ssh'"
              :create-type="createType"
              :port-mappings="portMappings"
              @refresh="creatorStore.refreshPorts()"
              @add="creatorStore.addPortMapping()"
              @update="(index, patch) => creatorStore.updatePortMapping(index, patch)"
              @remove="creatorStore.removePortMapping"
            />

            <CreateActions
              :is-creating="isCreating"
              :can-create="canCreate"
              :create-type="createType"
              :create-phase-text="createPhaseText"
              @close="close"
              @create="handleCreate"
            />
          </div>
        </div>

        <SaveConfigDialog
          :visible="showSaveDialog"
          :config-type="saveDialogType"
          @close="creatorStore.closeSaveDialog()"
          @save="handleSaveConfig"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
@import './creator/lab-creator.css';

.ssh-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.ssh-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ssh-form__field--inline {
  flex-direction: row;
  gap: 12px;
}

.ssh-form__field-half {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ssh-form__toggle {
  display: flex;
  gap: 8px;
}

.ssh-form__toggle-btn {
  padding: 8px 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 6px;
  background-color: var(--sm-color-bg-app);
  color: var(--sm-color-text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.ssh-form__toggle-btn.active {
  border-color: var(--sm-color-border-selected);
  background-color: var(--sm-color-surface-selected);
}

.ssh-form__toggle-btn:hover:not(.active) {
  border-color: var(--sm-color-text-secondary);
}

.ssh-form__input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ssh-form__input-row .form-input {
  flex: 1;
}

.ssh-form__checkbox {
  flex-direction: row;
  align-items: center;
}

.ssh-form__checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
}

.ssh-form__test-btn {
  align-self: flex-start;
}

.ssh-form__key-textarea {
  resize: vertical;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  min-height: 80px;
}
</style>
