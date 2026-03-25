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
  <div class="sandbox-page">
    <!-- Docker 检测中 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在检测 Docker...</p>
    </div>

    <!-- Docker 已安装 - 主界面 -->
    <template v-else-if="dockerStatus?.installed">
      <!-- 内容区域 -->
      <div class="sandbox-content">
        <div class="sidebar-wrapper" :class="{ collapsed: sandboxSidebarCollapsed }">
          <SandboxSidebar
            :sandboxs="sandboxList"
            :active-sandbox-id="currentSandbox?.sandboxId"
            :list-update-key="listUpdateKey"
            @select-sandbox="sandboxStore.handleSelectSandbox"
            @delete-sandbox="sandboxStore.handleDeleteSandbox"
          />
        </div>
        <SandboxMainContent
          :current-sandbox="currentSandbox"
        />
      </div>

      <!-- 创建沙箱弹窗 -->
      <SandboxCreator :visible="showSandboxCreator" @close="handleCloseCreator" />

      <!-- 配置管理弹窗 -->
      <ConfigManager :visible="showConfigManager" @close="handleCloseConfigManager" />

      <DeleteConfirmDialog
        :visible="deleteConfirmState.show"
        :sandbox="
          deleteConfirmState.sandboxId
            ? {
                sandboxId: deleteConfirmState.sandboxId,
                name: deleteConfirmState.sandboxName,
                creationType: deleteConfirmState.creationType || 'existing',
                containerIds: Array.from(
                  { length: deleteConfirmState.containerCount },
                  (_, index) => String(index)
                )
              }
            : null
        "
        @close="sandboxStore.hideDeleteConfirm()"
        @confirm="(_sandboxId, deleteContainers) => sandboxStore.confirmDelete(deleteContainers)"
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

    <!-- Docker 未安装 - 安装引导 -->
    <div v-else class="docker-install-guide">
      <h1>需要安装 Docker</h1>
      <p class="subtitle">沙箱功能需要 Docker 支持，请先安装 Docker</p>

      <button class="btn-primary download-btn" @click="openDockerWebsite">
        前往 Docker 官网下载
      </button>

      <p class="divider-text">或使用命令行安装</p>

      <div v-if="filteredCommands.length > 0" class="commands-section">
        <h3 class="section-title">
          推荐命令 ({{
            platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux'
          }})
        </h3>
        <div class="command-list">
          <div
            v-for="(cmd, index) in filteredCommands"
            :key="index"
            class="command-item recommended"
          >
            <span class="command-label">{{ cmd.label }}</span>
            <div class="command-content">
              <code>{{ cmd.cmd }}</code>
              <button
                class="copy-btn"
                :class="{ copied: copiedIndex === index }"
                @click="copyCommand(cmd.cmd, index)"
              >
                {{ copiedIndex === index ? '已复制' : '复制' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="otherCommands.length > 0" class="commands-section other-platforms">
        <h3 class="section-title">其他平台</h3>
        <div class="command-list">
          <div v-for="(cmd, index) in otherCommands" :key="`other-${index}`" class="command-item">
            <span class="command-label">{{ cmd.label }}</span>
            <div class="command-content">
              <code>{{ cmd.cmd }}</code>
              <button
                class="copy-btn"
                :class="{ copied: copiedIndex === index + 100 }"
                @click="copyCommand(cmd.cmd, index + 100)"
              >
                {{ copiedIndex === index + 100 ? '已复制' : '复制' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <p v-if="dockerStatus?.error" class="error-hint">检测时出现错误: {{ dockerStatus.error }}</p>
    </div>
  </div>
</template>

<style scoped>
.sandbox-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* 内容区域 */
.sandbox-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 侧边栏包装器 - 平滑过渡 */
.sidebar-wrapper {
  width: 280px;
  min-width: 280px;
  height: 100%;
  overflow: hidden;
  opacity: 1;
  transition:
    width 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    min-width 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.2s ease-out;
}

.sidebar-wrapper.collapsed {
  width: 0;
  min-width: 0;
  opacity: 0;
  pointer-events: none;
}

/* 加载状态 */
.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 16px;
  color: var(--theme-text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Docker 安装引导 */
.docker-install-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 40px 20px;
  overflow-y: auto;
}

.docker-install-guide h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.subtitle {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 0 0 24px 0;
  text-align: center;
}

.download-btn {
  padding: 12px 32px;
  font-size: 15px;
  font-weight: 600;
}

.divider-text {
  width: 100%;
  max-width: 600px;
  margin: 32px 0 24px 0;
  color: var(--theme-text-secondary);
  font-size: 13px;
  text-align: center;
}

.commands-section {
  width: 100%;
  max-width: 600px;
  margin-bottom: 24px;
}

.commands-section.other-platforms {
  opacity: 0.7;
}

.section-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-secondary);
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.command-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.command-item {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 12px 16px;
  transition: border-color 0.15s ease;
}

.command-item.recommended {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.command-item:hover {
  border-color: var(--theme-text-secondary);
}

.command-item.recommended:hover {
  border-color: var(--theme-accent);
}

.command-label {
  display: block;
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

.command-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.command-content code {
  flex: 1;
  font-family: var(--theme-font);
  font-size: 13px;
  color: var(--theme-text);
  word-break: break-all;
}

.copy-btn {
  padding: 4px 12px;
  font-size: 12px;
  font-family: var(--theme-font);
  background-color: transparent;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.copy-btn:hover {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-text-secondary);
  color: var(--theme-text);
}

.copy-btn.copied {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-bg);
}

.error-hint {
  font-size: 12px;
  color: var(--theme-danger);
  margin-top: 16px;
  text-align: center;
}
</style>
