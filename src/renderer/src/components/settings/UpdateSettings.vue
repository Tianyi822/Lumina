<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MarkdownIt from 'markdown-it'
import { useUpdateStore } from '@renderer/stores/updateStore'
import styles from './UpdateSettings.module.css'

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

const canManualDownload = computed(() => {
  return !!store.manualDownloadUrl && (store.status === 'available' || store.status === 'error')
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

function handleManualDownload(): void {
  store.openManualDownload()
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
  <div :class="styles['update-settings']">
    <!-- 当前版本 -->
    <div :class="styles['update-settings__section']">
      <h3 :class="styles['update-settings__section-title']">当前版本</h3>
      <p :class="styles['update-settings__version']">v{{ currentVersion }}</p>
    </div>

    <!-- 更新操作 -->
    <div :class="styles['update-settings__section']">
      <div :class="styles['update-settings__actions']">
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
        <button
          v-if="canManualDownload"
          :class="['sm-button', 'sm-button--primary', styles['update-settings__manual-link']]"
          @click="handleManualDownload"
        >
          下载最新版本
        </button>
      </div>

      <!-- 进度条 -->
      <div
        v-if="store.status === 'downloading' && store.progress"
        :class="styles['update-settings__progress']"
      >
        <div :class="styles['update-settings__progress-bar']">
          <div
            :class="styles['update-settings__progress-fill']"
            :style="{ width: `${store.progress.percent}%` }"
          ></div>
        </div>
        <span :class="styles['update-settings__progress-text']">
          {{ (store.progress.transferred / 1048576).toFixed(1) }} /
          {{ (store.progress.total / 1048576).toFixed(1) }} MB
        </span>
      </div>

      <!-- 状态提示 -->
      <p
        v-if="statusText"
        :class="[styles['update-settings__status'], styles[`is-${store.status}`]]"
      >
        {{ statusText }}
      </p>

      <!-- 开发模式提示 -->
      <p v-if="isDev" :class="styles['update-settings__dev-hint']">开发模式下更新功能不可用</p>
    </div>

    <!-- 版本历史 -->
    <div :class="styles['update-settings__section']">
      <h3 :class="styles['update-settings__section-title']">历史版本</h3>

      <div v-if="store.loadingReleases" :class="styles['update-settings__loading']">
        正在加载版本历史...
      </div>

      <div v-else-if="store.releasesError" :class="styles['update-settings__error']">
        {{ store.releasesError }}
      </div>

      <div v-else :class="styles['update-settings__releases']">
        <div
          v-for="release in store.releases"
          :key="release.version"
          :class="[
            styles['update-settings__release'],
            { [styles['is-expanded']]: expandedVersion === release.version }
          ]"
        >
          <button
            :class="styles['update-settings__release-header']"
            @click="toggleExpand(release.version)"
          >
            <span :class="styles['update-settings__release-toggle']">
              {{ expandedVersion === release.version ? '▼' : '▶' }}
            </span>
            <span :class="styles['update-settings__release-version']">v{{ release.version }}</span>
            <span :class="styles['update-settings__release-date']">{{
              formatDate(release.publishedAt)
            }}</span>
            <span
              v-if="release.version === currentVersion"
              :class="styles['update-settings__current-badge']"
            >
              当前版本
            </span>
          </button>

          <div
            v-if="expandedVersion === release.version"
            :class="styles['update-settings__release-body']"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div
              :class="styles['update-settings__release-content']"
              v-html="renderMarkdown(release.body)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
