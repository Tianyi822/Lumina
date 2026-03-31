<script setup lang="ts">
import { computed } from 'vue'
import type { ThemeConfig, ThemeMode } from '@renderer/types'
import { useTheme } from '@renderer/composables/useTheme'

interface Props {
  modelValue: ThemeConfig
}

interface Emits {
  (e: 'update:modelValue', value: ThemeConfig): void
  (e: 'theme-change', themeId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const {
  currentTheme,
  selectedTheme,
  themeMode,
  systemTheme,
  setTheme,
  setThemeMode,
  getAvailableThemes
} = useTheme()

// 可用主题列表
const availableThemes = computed(() => getAvailableThemes())

const isAutoMode = computed(() => themeMode.value === 'system')
const systemThemeLabel = computed(() => (systemTheme.value === 'dark' ? '深色' : '浅色'))

// 当前选中的主题 ID
const selectedThemeId = computed({
  get: () => selectedTheme.value,
  set: (themeId: string) => {
    // setTheme 是异步的，但我们不需要等待它完成
    setTheme(themeId)
    // 更新父组件的配置
    emit('update:modelValue', {
      ...props.modelValue,
      name: themeId
    })
    // 通知父组件主题变化
    emit('theme-change', themeId)
  }
})

const selectedMode = computed({
  get: () => themeMode.value,
  set: (mode: ThemeMode) => {
    setThemeMode(mode)
    emit('update:modelValue', {
      ...props.modelValue,
      mode,
      name: selectedTheme.value
    })
  }
})

/**
 * 选择主题（立即应用）
 */
function selectTheme(themeId: string): void {
  if (isAutoMode.value) {
    return
  }
  selectedThemeId.value = themeId
}

function toggleAutoTheme(): void {
  selectedMode.value = isAutoMode.value ? 'manual' : 'system'
}

/**
 * 判断主题是否被选中
 */
function isSelected(themeId: string): boolean {
  if (isAutoMode.value) {
    return false
  }

  return selectedTheme.value === themeId
}
</script>

<template>
  <div class="sm-settings-page theme-settings">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">主题设置</h2>
      <p class="sm-settings-page__description">
        选择适合你的界面风格，主题切换即时生效并会同步系统原生 UI。
      </p>
    </header>

    <button
      type="button"
      class="auto-theme-toggle"
      :aria-pressed="isAutoMode"
      @click="toggleAutoTheme"
    >
      <span class="auto-theme-toggle__copy">
        <span class="auto-theme-toggle__title">跟随系统主题</span>
        <span class="auto-theme-toggle__desc">
          当前检测到系统为{{ systemThemeLabel }}模式，{{
            isAutoMode ? '应用会自动同步' : '你可以手动切换主题'
          }}。
        </span>
      </span>

      <span class="auto-theme-toggle__control" aria-hidden="true">
        <span class="auto-theme-toggle__track">
          <span class="auto-theme-toggle__thumb"></span>
        </span>
      </span>
    </button>

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">可用主题</h3>
          <p class="sm-settings-page__section-description">
            <span v-if="isAutoMode">
              已启用跟随系统，主题卡片仅作当前映射预览。关闭自动切换后可手动选择。
            </span>
            <span v-else>选择一个主题作为全局外观，所有界面元素将自动适配。</span>
          </p>
        </div>

        <span class="sm-settings-chip sm-settings-chip--accent">
          当前主题:
          {{ availableThemes.find((t) => t.id === currentTheme)?.name || currentTheme }}
        </span>
      </div>

      <div class="theme-grid">
        <button
          v-for="theme in availableThemes"
          :key="theme.id"
          type="button"
          class="theme-card"
          :class="{ 'is-selected': isSelected(theme.id), 'is-disabled': isAutoMode }"
          :aria-label="`应用主题 ${theme.name}`"
          :aria-pressed="!isAutoMode && isSelected(theme.id)"
          :disabled="isAutoMode"
          @click="selectTheme(theme.id)"
        >
          <div class="theme-preview">
            <div
              class="preview-color primary"
              :style="{ backgroundColor: theme.previewColors?.primary }"
            ></div>
            <div
              class="preview-color secondary"
              :style="{ backgroundColor: theme.previewColors?.secondary }"
            ></div>
            <div
              class="preview-color accent"
              :style="{ backgroundColor: theme.previewColors?.accent }"
            ></div>
            <div
              v-if="theme.previewColors?.extra1"
              class="preview-color extra"
              :style="{ backgroundColor: theme.previewColors?.extra1 }"
            ></div>
            <div
              v-if="theme.previewColors?.extra2"
              class="preview-color extra"
              :style="{ backgroundColor: theme.previewColors?.extra2 }"
            ></div>
          </div>

          <div class="theme-info">
            <span class="theme-name">{{ theme.name }}</span>
            <span v-if="theme.description" class="theme-desc">{{ theme.description }}</span>
          </div>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.theme-settings {
  gap: var(--sm-space-5);
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.auto-theme-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 18px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--sm-color-accent) 8%, transparent),
      transparent
    ),
    var(--sm-color-surface-2);
  color: inherit;
  cursor: pointer;
  transition:
    border-color var(--sm-transition-fast),
    background-color var(--sm-transition-fast),
    transform var(--sm-transition-fast);
}

.auto-theme-toggle:hover {
  border-color: var(--sm-color-border-strong);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--sm-color-accent) 12%, transparent),
      transparent
    ),
    var(--sm-color-surface-hover);
}

.auto-theme-toggle:focus-visible {
  border-color: var(--sm-color-border-accent);
}

.auto-theme-toggle__copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}

.auto-theme-toggle__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.auto-theme-toggle__desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.auto-theme-toggle__control {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.auto-theme-toggle__track {
  position: relative;
  display: inline-flex;
  width: 52px;
  height: 30px;
  padding: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--sm-color-border-default) 72%, transparent);
  transition: background-color var(--sm-transition-fast);
}

.auto-theme-toggle[aria-pressed='true'] .auto-theme-toggle__track {
  background: color-mix(in srgb, var(--sm-color-accent) 72%, white 8%);
}

.auto-theme-toggle__thumb {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
  transform: translateX(0);
  transition: transform var(--sm-transition-fast);
}

.auto-theme-toggle[aria-pressed='true'] .auto-theme-toggle__thumb {
  transform: translateX(22px);
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  cursor: pointer;
  text-align: left;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.theme-card:hover {
  border-color: var(--sm-color-border-strong);
  background: var(--sm-color-surface-hover);
}

.theme-card.is-disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.theme-card.is-disabled:hover {
  border-color: var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
}

.theme-card.is-selected {
  border-color: var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.08);
}

.theme-card:focus-visible {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-surface-hover);
}

.theme-preview {
  display: flex;
  gap: 4px;
  height: 48px;
  border-radius: var(--sm-radius-sm);
  overflow: hidden;
}

.preview-color {
  flex: 1;
  border-radius: 4px;
}

.preview-color.primary {
  flex: 2;
}

.preview-color.extra {
  flex: 1;
}

.theme-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.theme-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.theme-desc {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
  line-height: 1.5;
}
</style>
