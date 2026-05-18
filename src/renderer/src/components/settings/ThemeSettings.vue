<script setup lang="ts">
import { computed } from 'vue'
import type { ThemeConfig, ThemeMode } from '@renderer/types'
import { useTheme } from '@renderer/composables/useTheme'
import styles from './ThemeSettings.module.css'

interface Props {
  modelValue: ThemeConfig
}

interface Emits {
  (e: 'update:modelValue', value: ThemeConfig): void
  (e: 'theme-change', themeId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const theme = useTheme()

// 可用主题列表
const availableThemes = computed(() => theme.getAvailableThemes())

const isAutoMode = computed(() => theme.themeMode === 'system')
const systemThemeLabel = computed(() => (theme.systemTheme === 'dark' ? '深色' : '浅色'))

// 当前选中的主题 ID
const selectedThemeId = computed({
  get: () => theme.selectedTheme,
  set: (themeId: string) => {
    // setTheme 是异步的，但我们不需要等待它完成
    theme.setTheme(themeId)
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
  get: () => theme.themeMode,
  set: (mode: ThemeMode) => {
    theme.setThemeMode(mode)
    emit('update:modelValue', {
      ...props.modelValue,
      mode,
      name: theme.selectedTheme
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

  return theme.selectedTheme === themeId
}
</script>

<template>
  <div :class="['sm-settings-page', styles['theme-settings']]">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">主题设置</h2>
      <p class="sm-settings-page__description">
        选择适合你的界面风格，主题切换即时生效并会同步系统原生 UI。
      </p>
    </header>

    <button
      type="button"
      :class="styles['auto-theme-toggle']"
      :aria-pressed="isAutoMode"
      @click="toggleAutoTheme"
    >
      <span :class="styles['auto-theme-toggle__copy']">
        <span :class="styles['auto-theme-toggle__title']">跟随系统主题</span>
        <span :class="styles['auto-theme-toggle__desc']">
          当前检测到系统为{{ systemThemeLabel }}模式，{{
            isAutoMode ? '应用会自动同步' : '你可以手动切换主题'
          }}。
        </span>
      </span>

      <span :class="styles['auto-theme-toggle__control']" aria-hidden="true">
        <span :class="styles['auto-theme-toggle__track']">
          <span :class="styles['auto-theme-toggle__thumb']"></span>
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
          {{ availableThemes.find((t) => t.id === theme.currentTheme)?.name || theme.currentTheme }}
        </span>
      </div>

      <div :class="styles['theme-grid']">
        <button
          v-for="theme in availableThemes"
          :key="theme.id"
          type="button"
          :class="[
            styles['theme-card'],
            { [styles['is-selected']]: isSelected(theme.id), [styles['is-disabled']]: isAutoMode }
          ]"
          :aria-label="`应用主题 ${theme.name}`"
          :aria-pressed="!isAutoMode && isSelected(theme.id)"
          :disabled="isAutoMode"
          @click="selectTheme(theme.id)"
        >
          <div :class="styles['theme-preview']">
            <div
              :class="[styles['preview-color'], styles.primary]"
              :style="{ backgroundColor: theme.previewColors?.primary }"
            ></div>
            <div
              :class="[styles['preview-color'], styles.secondary]"
              :style="{ backgroundColor: theme.previewColors?.secondary }"
            ></div>
            <div
              :class="[styles['preview-color'], styles.accent]"
              :style="{ backgroundColor: theme.previewColors?.accent }"
            ></div>
            <div
              v-if="theme.previewColors?.extra1"
              :class="[styles['preview-color'], styles.extra]"
              :style="{ backgroundColor: theme.previewColors?.extra1 }"
            ></div>
            <div
              v-if="theme.previewColors?.extra2"
              :class="[styles['preview-color'], styles.extra]"
              :style="{ backgroundColor: theme.previewColors?.extra2 }"
            ></div>
          </div>

          <div :class="styles['theme-info']">
            <span :class="styles['theme-name']">{{ theme.name }}</span>
            <span v-if="theme.description" :class="styles['theme-desc']">{{
              theme.description
            }}</span>
          </div>
        </button>
      </div>
    </section>
  </div>
</template>
