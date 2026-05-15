<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MarkdownIt from 'markdown-it'
import { useUpdateStore } from '@renderer/stores/updateStore'

const store = useUpdateStore()
const expandedVersion = ref<string | null>(null)

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// eslint-disable-next-line no-undef
const currentVersion = __APP_VERSION__

const isDev = import.meta.env.DEV

const canCheck = computed(() => {
  return (
    !isDev &&
    store.status !== 'checking' &&
    store.status !== 'downloading' &&
    store.status !== 'installing'
  )
})

const canUpdate = computed(() => {
  return store.status === 'available' && !store.manualDownloadUrl
})

const canInstall = computed(() => {
  return store.status === 'downloaded'
})

const updateButtonText = computed(() => {
  if (store.status === 'downloading') {
    return store.progress ? `${Math.round(store.progress.percent)}%` : '下载中...'
  }
  if (store.status === 'downloaded') {
    return '重启安装'
  }
  if (store.status === 'installing') {
    return '正在安装...'
  }
  return '立即更新'
})

const statusText = computed(() => {
  switch (store.status) {
    case 'checking':
      return '正在检查更新...'
    case 'available':
      return store.manualDownloadUrl
        ? `发现新版本 v${store.latestVersion}，请下载最新安装包手动更新`
        : `发现新版本 v${store.latestVersion}`
    case 'not-available':
      return '已是最新版本'
    case 'downloaded':
      return '下载完成，点击"重启安装"完成更新'
    case 'installing':
      return '正在重启安装...'
    case 'error':
      return store.errorMessage || '检查更新失败，请稍后重试'
    default:
      return ''
  }
})

function handleCheck(): void {
  store.checkForUpdate()
}

async function handleUpdate(): Promise<void> {
  if (store.status === 'downloaded') {
    store.quitAndInstall()
  } else if (store.status === 'available') {
    await store.downloadUpdate()
  }
}

function toggleExpand(version: string): void {
  expandedVersion.value = expandedVersion.value === version ? null : version
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function renderMarkdown(content: string): string {
  return md.render(content)
}

onMounted(() => {
  store.setupListeners()
  store.fetchReleases(currentVersion)
})

onUnmounted(() => {
  store.cleanupListeners()
})
</script>

<template>
  <div class="update-settings">
    <!-- 当前版本 -->
    <div class="update-settings__section">
      <h3 class="update-settings__section-title">当前版本</h3>
      <p class="update-settings__version">v{{ currentVersion }}</p>
    </div>

    <!-- 更新操作 -->
    <div class="update-settings__section">
      <div class="update-settings__actions">
        <button class="sm-button" :disabled="!canCheck" @click="handleCheck">
          {{ store.status === 'checking' ? '检查中...' : '检查更新' }}
        </button>
        <button
          v-if="!store.manualDownloadUrl"
          class="sm-button sm-button--primary"
          :disabled="!canUpdate && !canInstall"
          @click="handleUpdate"
        >
          {{ updateButtonText }}
        </button>
      </div>

      <!-- 进度条 -->
      <div
        v-if="store.status === 'downloading' && store.progress"
        class="update-settings__progress"
      >
        <div class="update-settings__progress-bar">
          <div
            class="update-settings__progress-fill"
            :style="{ width: `${store.progress.percent}%` }"
          ></div>
        </div>
        <span class="update-settings__progress-text">
          {{ (store.progress.transferred / 1048576).toFixed(1) }} /
          {{ (store.progress.total / 1048576).toFixed(1) }} MB
        </span>
      </div>

      <!-- 状态提示 -->
      <p v-if="statusText" class="update-settings__status" :class="`is-${store.status}`">
        {{ statusText }}
      </p>

      <a
        v-if="store.manualDownloadUrl"
        class="sm-button sm-button--primary update-settings__manual-link"
        :href="store.manualDownloadUrl"
        target="_blank"
        rel="noreferrer"
      >
        下载最新版本
      </a>

      <!-- 开发模式提示 -->
      <p v-if="isDev" class="update-settings__dev-hint">开发模式下更新功能不可用</p>
    </div>

    <!-- 版本历史 -->
    <div class="update-settings__section">
      <h3 class="update-settings__section-title">历史版本</h3>

      <div v-if="store.loadingReleases" class="update-settings__loading">正在加载版本历史...</div>

      <div v-else-if="store.releasesError" class="update-settings__error">
        {{ store.releasesError }}
      </div>

      <div v-else class="update-settings__releases">
        <div
          v-for="release in store.releases"
          :key="release.version"
          class="update-settings__release"
          :class="{ 'is-expanded': expandedVersion === release.version }"
        >
          <button class="update-settings__release-header" @click="toggleExpand(release.version)">
            <span class="update-settings__release-toggle">
              {{ expandedVersion === release.version ? '▼' : '▶' }}
            </span>
            <span class="update-settings__release-version">v{{ release.version }}</span>
            <span class="update-settings__release-date">{{ formatDate(release.publishedAt) }}</span>
            <span v-if="release.version === currentVersion" class="update-settings__current-badge">
              当前版本
            </span>
          </button>

          <div v-if="expandedVersion === release.version" class="update-settings__release-body">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="update-settings__release-content" v-html="renderMarkdown(release.body)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-settings {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.update-settings__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.update-settings__section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  margin: 0;
}

.update-settings__version {
  font-size: 24px;
  font-weight: 700;
  color: var(--sm-color-text-primary);
  margin: 0;
}

.update-settings__actions {
  display: flex;
  gap: 12px;
}

.update-settings__progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.update-settings__progress-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--sm-color-surface-1);
  overflow: hidden;
}

.update-settings__progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--sm-color-primary, #4f46e5);
  transition: width 0.3s ease;
}

.update-settings__progress-text {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.update-settings__status {
  font-size: 13px;
  margin: 0;
  color: var(--sm-color-text-secondary);
}

.update-settings__status.is-available {
  color: var(--sm-color-primary, #4f46e5);
}

.update-settings__status.is-not-available {
  color: var(--sm-color-success, #22c55e);
}

.update-settings__status.is-error {
  color: var(--sm-color-error, #ef4444);
}

.update-settings__status.is-downloaded {
  color: var(--sm-color-success, #22c55e);
}

.update-settings__status.is-installing {
  color: var(--sm-color-primary, #4f46e5);
}

.update-settings__manual-link {
  width: fit-content;
  text-decoration: none;
}

.update-settings__dev-hint {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  font-style: italic;
  margin: 0;
}

.update-settings__loading,
.update-settings__error {
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}

.update-settings__error {
  color: var(--sm-color-error, #ef4444);
}

.update-settings__releases {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  overflow: hidden;
}

.update-settings__release {
  border-bottom: 1px solid var(--sm-color-border-default);
}

.update-settings__release:last-child {
  border-bottom: none;
}

.update-settings__release-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: var(--sm-color-surface-3);
  color: var(--sm-color-text-primary);
  cursor: pointer;
  font-size: 13px;
  text-align: left;
}

.update-settings__release-header:hover {
  background: var(--sm-color-surface-2);
}

.update-settings__release-toggle {
  font-size: 10px;
  color: var(--sm-color-text-secondary);
  flex-shrink: 0;
}

.update-settings__release-version {
  font-weight: 600;
}

.update-settings__release-date {
  color: var(--sm-color-text-secondary);
  font-size: 12px;
}

.update-settings__current-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--sm-color-primary, #4f46e5);
  color: #fff;
  margin-left: auto;
}

.update-settings__release-body {
  padding: 12px 14px 14px;
  background: var(--sm-color-surface-2);
}

.update-settings__release-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-primary);
}

.update-settings__release-content :deep(ul) {
  padding-left: 20px;
  margin: 4px 0;
}

.update-settings__release-content :deep(li) {
  margin: 2px 0;
}

.update-settings__release-content :deep(h1),
.update-settings__release-content :deep(h2),
.update-settings__release-content :deep(h3) {
  font-size: 14px;
  margin: 8px 0 4px;
}
</style>
