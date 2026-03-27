<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useSandboxStore, useUIStateStore } from '@renderer/stores'
import SandboxSidebar from '@renderer/components/sandbox/SandboxSidebar.vue'
import SandboxMainContent from '@renderer/components/sandbox/SandboxMainContent.vue'
import SandboxCreator from '@renderer/components/sandbox/SandboxCreator.vue'
import ConfigManager from '@renderer/components/sandbox/ConfigManager.vue'
import OperationMessage from '@renderer/components/sandbox/OperationMessage.vue'
import DeleteConfirmDialog from '@renderer/components/sandbox/DeleteConfirmDialog.vue'
import type { PlatformType, DockerCheckResult } from '@shared/types/sandbox'

interface InstallCommand {
  platform: PlatformType
  label: string
  cmd: string
}

const DOCKER_WEBSITE = 'https://www.docker.com/products/docker-desktop/'

const installCommands: InstallCommand[] = [
  { platform: 'darwin', label: 'macOS (Homebrew)', cmd: 'brew install --cask docker' },
  {
    platform: 'linux',
    label: 'Ubuntu/Debian (官方脚本)',
    cmd: 'curl -fsSL https://get.docker.com | sh'
  },
  {
    platform: 'linux',
    label: 'Ubuntu/Debian (apt)',
    cmd: 'sudo apt update && sudo apt install -y docker.io'
  },
  { platform: 'win32', label: 'Windows (winget)', cmd: 'winget install Docker.DockerDesktop' },
  { platform: 'win32', label: 'Windows (Chocolatey)', cmd: 'choco install docker-desktop' },
  { platform: 'linux', label: 'CentOS/RHEL', cmd: 'sudo yum install -y docker' },
  { platform: 'linux', label: 'Fedora', cmd: 'sudo dnf install -y docker' },
  { platform: 'linux', label: 'Arch Linux', cmd: 'sudo pacman -S docker' }
]

const sandboxStore = useSandboxStore()
const uiStateStore = useUIStateStore()

const {
  currentSandbox,
  sandboxList,
  listUpdateKey,
  operationMessage,
  messageVisible,
  deleteConfirmState
} = storeToRefs(sandboxStore)

const { sandboxSidebarCollapsed, showSandboxCreator, showConfigManager } = storeToRefs(uiStateStore)

const dockerStatus = ref<DockerCheckResult | null>(null)
const platform = ref<PlatformType>('darwin')
const loading = ref(true)
const copiedIndex = ref<number | null>(null)

const filteredCommands = computed(() => {
  return installCommands.filter((cmd) => cmd.platform === platform.value)
})

const otherCommands = computed(() => {
  return installCommands.filter((cmd) => cmd.platform !== platform.value)
})

const currentPlatformLabel = computed(() => {
  const labels: Record<PlatformType, string> = {
    darwin: 'macOS',
    win32: 'Windows',
    linux: 'Linux'
  }

  return labels[platform.value]
})

const recommendedChannelLabel = computed(() => {
  return filteredCommands.value[0]?.label || 'Docker Desktop'
})

// ==================== Docker 检测 ====================

const checkDocker = async (): Promise<void> => {
  try {
    loading.value = true
    const [statusResult, platformResult] = await Promise.all([
      window.api.sandbox.checkDocker(),
      window.api.sandbox.getPlatform()
    ])
    dockerStatus.value = statusResult
    platform.value = platformResult

    if (!statusResult.installed && statusResult.error && statusResult.error !== 'Docker 未安装') {
      sandboxStore.notifyDockerError('Docker 检测失败', statusResult.error, 'sandbox:checkDocker')
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    dockerStatus.value = { installed: false, error: errorMessage }
    sandboxStore.notifyDockerError('Docker 检测失败', errorMessage, 'sandbox:checkDocker')
  } finally {
    loading.value = false
  }
}

const openDockerWebsite = async (): Promise<void> => {
  const result = await window.api.sandbox.openExternal(DOCKER_WEBSITE)
  if (!result.success) {
    sandboxStore.notifyDockerError('打开 Docker 官网失败', result.error || '未知错误')
  }
}

const copyCommand = async (cmd: string, index: number): Promise<void> => {
  try {
    await navigator.clipboard.writeText(cmd)
    copiedIndex.value = index
    setTimeout(() => {
      copiedIndex.value = null
    }, 2000)
  } catch (error) {
    sandboxStore.notifyDockerError(
      '复制命令失败',
      error instanceof Error ? error.message : String(error)
    )
  }
}

const handleCloseCreator = (): void => {
  uiStateStore.closeSandboxCreator()
}

const handleCloseConfigManager = (): void => {
  uiStateStore.closeConfigManager()
}

// ==================== 生命周期 ====================

onMounted(async () => {
  await checkDocker()

  if (dockerStatus.value?.installed) {
    await sandboxStore.loadSandboxList()
  }
})
</script>

<template>
  <div class="sm-sandbox-page">
    <div
      v-if="loading"
      class="sm-page-main sm-sandbox-page__loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="sm-spinner sm-spinner--large sm-sandbox-page__loading-spinner"></div>
      <p>正在检测 Docker...</p>
    </div>

    <template v-else-if="dockerStatus?.installed">
      <div class="sm-sandbox-workspace sm-workspace-page">
        <div class="sm-sidebar-frame" :class="{ 'is-collapsed': sandboxSidebarCollapsed }">
          <SandboxSidebar
            :sandboxs="sandboxList"
            :active-sandbox-id="currentSandbox?.sandboxId"
            :list-update-key="listUpdateKey"
            :deleting-sandbox-id="
              deleteConfirmState.isDeleting ? deleteConfirmState.sandboxId : null
            "
            @select-sandbox="sandboxStore.handleSelectSandbox"
            @delete-sandbox="sandboxStore.handleDeleteSandbox"
          />
        </div>
        <div class="sm-page-main">
          <SandboxMainContent :current-sandbox="currentSandbox" />
        </div>
      </div>

      <!-- 创建沙箱弹窗 -->
      <SandboxCreator :visible="showSandboxCreator" @close="handleCloseCreator" />

      <!-- 配置管理弹窗 -->
      <ConfigManager :visible="showConfigManager" @close="handleCloseConfigManager" />

      <DeleteConfirmDialog
        :visible="deleteConfirmState.show"
        :is-deleting="deleteConfirmState.isDeleting"
        :sandbox="
          deleteConfirmState.sandboxId
            ? {
                sandboxId: deleteConfirmState.sandboxId,
                name: deleteConfirmState.sandboxName,
                creationType: deleteConfirmState.creationType || 'existing',
                containerIds: Array.from(
                  { length: deleteConfirmState.containerCount },
                  (_, index) => String(index)
                ),
                hasWorkspace: deleteConfirmState.hasWorkspace,
                workspaceName: deleteConfirmState.workspaceName
              }
            : null
        "
        @close="sandboxStore.hideDeleteConfirm()"
        @confirm="(_sandboxId, options) => sandboxStore.confirmDelete(options)"
      />

      <!-- 操作消息提示 -->
      <OperationMessage
        v-if="operationMessage"
        :type="operationMessage.type"
        :title="operationMessage.title"
        :message="operationMessage.message"
        :visible="messageVisible"
        @close="sandboxStore.hideMessage()"
      />
    </template>

    <div v-else class="sm-page-main sm-sandbox-install">
      <div class="sm-sandbox-install__shell">
        <section class="sm-sandbox-install__overview">
          <div class="sm-sandbox-install__copy">
            <span class="sm-sandbox-install__eyebrow">运行依赖</span>
            <div class="sm-sandbox-install__headline">
              <div class="sm-sandbox-install__titles">
                <h1>Docker 未就绪</h1>
                <p class="subtitle">
                  沙箱工作区依赖本机 Docker 运行时。安装并启动服务后，
                  返回这里重新检测即可进入工程控制台。
                </p>
              </div>
              <span class="sm-badge sm-sandbox-install__platform">{{ currentPlatformLabel }}</span>
            </div>
          </div>

          <div class="sm-sandbox-install__cards">
            <div class="sm-sandbox-status-card">
              <span class="sm-sandbox-status-card__label">当前状态</span>
              <strong>未检测到 Docker</strong>
              <p>应用尚未发现可用的 Docker 运行时，因此沙箱、终端和日志能力均不可用。</p>
            </div>
            <div class="sm-sandbox-status-card">
              <span class="sm-sandbox-status-card__label">推荐通道</span>
              <strong>{{ recommendedChannelLabel }}</strong>
              <p>优先使用与你当前平台匹配的官方安装方式，完成后保持 Docker 服务处于运行状态。</p>
            </div>
            <div class="sm-sandbox-status-card">
              <span class="sm-sandbox-status-card__label">完成后动作</span>
              <strong>返回并重新检测</strong>
              <p>安装完成后无需重启应用，重新检测即可验证运行时状态并恢复沙箱工作区。</p>
            </div>
          </div>

          <div class="sm-sandbox-install__actions">
            <button class="sm-button sm-button--primary" @click="openDockerWebsite">
              前往 Docker 官网
            </button>
            <button class="sm-button sm-button--secondary" @click="checkDocker">重新检测</button>
          </div>
        </section>

        <section v-if="filteredCommands.length > 0" class="sm-sandbox-install__panel">
          <div class="sm-sandbox-install__panel-header">
            <div>
              <span class="sm-sandbox-install__eyebrow">推荐命令</span>
              <h3>当前平台安装方式</h3>
            </div>
            <span class="sm-badge">{{ currentPlatformLabel }}</span>
          </div>

          <div class="sm-sandbox-command-list">
            <div
              v-for="(cmd, index) in filteredCommands"
              :key="index"
              class="sm-sandbox-command-item is-recommended"
            >
              <span class="sm-sandbox-command-item__label">{{ cmd.label }}</span>
              <div class="sm-sandbox-command-item__content">
                <code>{{ cmd.cmd }}</code>
                <button
                  class="sm-button sm-button--secondary sm-button--small sm-sandbox-copy-button"
                  :class="{ 'is-copied': copiedIndex === index }"
                  @click="copyCommand(cmd.cmd, index)"
                >
                  {{ copiedIndex === index ? '已复制' : '复制' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section
          v-if="otherCommands.length > 0"
          class="sm-sandbox-install__panel sm-sandbox-install__panel--muted"
        >
          <div class="sm-sandbox-install__panel-header">
            <div>
              <span class="sm-sandbox-install__eyebrow">备用通道</span>
              <h3>其他平台安装方式</h3>
            </div>
          </div>

          <div class="sm-sandbox-command-list">
            <div
              v-for="(cmd, index) in otherCommands"
              :key="`other-${index}`"
              class="sm-sandbox-command-item"
            >
              <span class="sm-sandbox-command-item__label">{{ cmd.label }}</span>
              <div class="sm-sandbox-command-item__content">
                <code>{{ cmd.cmd }}</code>
                <button
                  class="sm-button sm-button--secondary sm-button--small sm-sandbox-copy-button"
                  :class="{ 'is-copied': copiedIndex === index + 100 }"
                  @click="copyCommand(cmd.cmd, index + 100)"
                >
                  {{ copiedIndex === index + 100 ? '已复制' : '复制' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <div
          v-if="dockerStatus?.error && dockerStatus.error !== 'Docker 未安装'"
          class="sm-notice sm-notice--error sm-sandbox-install__error"
        >
          检测返回：{{ dockerStatus.error }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sm-sandbox-page {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--sm-color-bg-canvas);
}

.sm-sandbox-page > .sm-page-main {
  margin: var(--sm-space-3);
}

.sm-sandbox-workspace {
  flex: 1;
}

.sm-sandbox-page__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 16px;
  color: var(--sm-color-text-secondary);
}

.sm-sandbox-page__loading-spinner {
  color: var(--sm-color-accent-hover);
}

.sm-sandbox-install {
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.sm-sandbox-install__shell {
  width: min(960px, 100%);
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  padding: var(--sm-space-6);
  margin: 0 auto;
}

.sm-sandbox-install__overview,
.sm-sandbox-install__panel {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  padding: var(--sm-space-6);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-2);
}

.sm-sandbox-install__copy,
.sm-sandbox-install__titles {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.sm-sandbox-install__eyebrow {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.sm-sandbox-install__headline,
.sm-sandbox-install__panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
}

.sm-sandbox-install__titles h1,
.sm-sandbox-install__panel-header h3 {
  margin: 0;
  color: var(--sm-color-text-primary);
}

.sm-sandbox-install__titles h1 {
  font-size: 20px;
  line-height: 1.2;
}

.sm-sandbox-install__panel-header h3 {
  font-size: 16px;
  line-height: 1.3;
}

.subtitle {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
  max-width: 620px;
}

.sm-sandbox-install__platform {
  flex-shrink: 0;
}

.sm-sandbox-install__cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sm-space-4);
}

.sm-sandbox-status-card {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-2);
  padding: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
}

.sm-sandbox-status-card__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.sm-sandbox-status-card strong {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sm-sandbox-status-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.sm-sandbox-install__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-3);
}

.sm-sandbox-install__panel--muted {
  background: var(--sm-color-surface-1);
}

.sm-sandbox-command-list {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.sm-sandbox-command-item {
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-md);
  padding: var(--sm-space-4);
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast);
}

.sm-sandbox-command-item.is-recommended {
  border-color: var(--sm-color-border-accent);
  background-color: rgba(142, 149, 217, 0.08);
}

.sm-sandbox-command-item:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.sm-sandbox-command-item.is-recommended:hover {
  border-color: var(--sm-color-border-accent);
}

.sm-sandbox-command-item__label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--sm-color-text-secondary);
  margin-bottom: var(--sm-space-2);
}

.sm-sandbox-command-item__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.sm-sandbox-command-item__content code {
  flex: 1;
  display: block;
  padding: 10px 12px;
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-bg-embedded);
  font-family: var(--sm-font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-primary);
  word-break: break-all;
}

.sm-sandbox-copy-button {
  white-space: nowrap;
}

.sm-sandbox-copy-button.is-copied {
  background-color: rgba(142, 149, 217, 0.14);
  border-color: var(--sm-color-border-accent);
  color: var(--sm-color-text-primary);
}

.sm-sandbox-install__error {
  margin-top: calc(var(--sm-space-2) * -1);
}

@media (max-width: 900px) {
  .sm-sandbox-install__cards {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .sm-sandbox-install__shell {
    padding: var(--sm-space-4);
  }

  .sm-sandbox-install__overview,
  .sm-sandbox-install__panel {
    padding: var(--sm-space-5);
  }

  .sm-sandbox-install__headline,
  .sm-sandbox-install__panel-header,
  .sm-sandbox-command-item__content {
    flex-direction: column;
    align-items: stretch;
  }

  .sm-sandbox-copy-button {
    width: 100%;
  }
}
</style>
