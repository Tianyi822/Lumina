<script setup lang="ts">
import { computed } from 'vue'
import type { ThemeConfig } from '@renderer/types'
import { useTheme } from '@renderer/composables/useTheme'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

interface Props {
  modelValue: ThemeConfig
}

interface Emits {
  (e: 'update:modelValue', value: ThemeConfig): void
  (e: 'theme-change', themeId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { currentTheme, setTheme, getAvailableThemes } = useTheme()

// 可用主题列表
const availableThemes = computed(() => getAvailableThemes())

// 当前选中的主题 ID
const selectedThemeId = computed({
  get: () => currentTheme.value,
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

/**
 * 选择主题（立即应用）
 */
function selectTheme(themeId: string): void {
  selectedThemeId.value = themeId
}

/**
 * 判断主题是否被选中
 */
function isSelected(themeId: string): boolean {
  return currentTheme.value === themeId
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

    <section class="sm-settings-page__section">
      <div class="sm-settings-page__section-header">
        <div>
          <h3 class="sm-settings-page__section-title">可用主题</h3>
          <p class="sm-settings-page__section-description">
            选择一个主题作为全局外观，所有界面元素将自动适配。
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
          :class="{ 'is-selected': isSelected(theme.id) }"
          :aria-label="`应用主题 ${theme.name}`"
          :aria-pressed="isSelected(theme.id)"
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

          <div v-if="isSelected(theme.id)" class="selected-indicator">
            <SvgIcon name="check" :size="14" />
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

.selected-indicator {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  border: 1px solid var(--sm-color-border-accent);
  border-radius: 999px;
  background: rgba(142, 149, 217, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
}

.selected-indicator svg {
  width: 14px;
  height: 14px;
  color: var(--sm-color-accent-hover);
}
</style>
