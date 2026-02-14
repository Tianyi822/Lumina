<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

type PlatformType = 'darwin' | 'win32' | 'linux'

interface DockerStatus {
  installed: boolean
  version?: string
  error?: string
}

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

const dockerStatus = ref<DockerStatus | null>(null)
const platform = ref<PlatformType>('darwin')
const loading = ref(true)
const copiedIndex = ref<number | null>(null)

const filteredCommands = computed(() => {
  return installCommands.filter((cmd) => cmd.platform === platform.value)
})

const otherCommands = computed(() => {
  return installCommands.filter((cmd) => cmd.platform !== platform.value)
})

const checkDocker = async (): Promise<void> => {
  try {
    loading.value = true
    const [statusResult, platformResult] = await Promise.all([
      window.api.sandbox.checkDocker(),
      window.api.sandbox.getPlatform()
    ])
    dockerStatus.value = statusResult
    platform.value = platformResult
  } catch (error) {
    console.error('检测 Docker 失败:', error)
    dockerStatus.value = { installed: false, error: String(error) }
  } finally {
    loading.value = false
  }
}

const openDockerWebsite = async (): Promise<void> => {
  await window.api.sandbox.openExternal(DOCKER_WEBSITE)
}

const copyCommand = async (cmd: string, index: number): Promise<void> => {
  try {
    await navigator.clipboard.writeText(cmd)
    copiedIndex.value = index
    setTimeout(() => {
      copiedIndex.value = null
    }, 2000)
  } catch (error) {
    console.error('复制失败:', error)
  }
}

onMounted(() => {
  checkDocker()
})
</script>

<template>
  <div class="sandbox-page">
    <div class="sandbox-container">
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>正在检测 Docker...</p>
      </div>

      <div v-else-if="dockerStatus?.installed" class="docker-installed">
        <div class="installed-icon">✓</div>
        <h1>Docker 已安装</h1>
        <p class="version-info">版本: {{ dockerStatus.version }}</p>
        <p class="hint">沙箱功能即将上线...</p>
      </div>

      <div v-else class="docker-not-installed">
        <div class="docker-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="64" height="64">
            <path
              d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.186m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186h-2.119a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z"
            />
          </svg>
        </div>
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

        <p v-if="dockerStatus?.error" class="error-hint">
          检测时出现错误: {{ dockerStatus.error }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sandbox-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sandbox-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  overflow-y: auto;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
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

.docker-installed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.installed-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background-color: var(--theme-success);
  color: var(--theme-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: bold;
}

.docker-installed h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.version-info {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 0;
}

.hint {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin-top: 8px;
}

.docker-not-installed {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 600px;
  width: 100%;
}

.docker-icon {
  color: var(--theme-text-secondary);
  margin-bottom: 16px;
}

.docker-not-installed h1 {
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
  margin: 32px 0 24px 0;
  color: var(--theme-text-secondary);
  font-size: 13px;
  text-align: center;
}

.commands-section {
  width: 100%;
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
