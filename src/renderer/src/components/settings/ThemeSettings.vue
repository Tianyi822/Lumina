<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { ThemeConfig } from '@renderer/types'
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

const { currentTheme, setTheme, getAvailableThemes, initTheme } = useTheme()

// 可用主题列表
const availableThemes = computed(() => getAvailableThemes())

// 当前选中的主题 ID
const selectedThemeId = computed({
  get: () => currentTheme.value,
  set: (themeId: string) => {
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

// 组件挂载时初始化主题
onMounted(() => {
  initTheme()
})
</script>

<template>
  <div class="theme-settings">
    <h3 class="section-title">选择主题</h3>
    <p class="section-desc">选择一个你喜欢的主题，选择后立即生效</p>

    <div class="theme-grid">
      <div
        v-for="theme in availableThemes"
        :key="theme.id"
        class="theme-card"
        :class="{ selected: isSelected(theme.id) }"
        @click="selectTheme(theme.id)"
      >
        <!-- 主题预览色块 -->
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

        <!-- 主题信息 -->
        <div class="theme-info">
          <span class="theme-name">{{ theme.name }}</span>
          <span v-if="theme.description" class="theme-desc">{{ theme.description }}</span>
        </div>

        <!-- 选中指示器 -->
        <div v-if="isSelected(theme.id)" class="selected-indicator">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
    </div>

    <!-- 当前主题提示 -->
    <div class="current-theme-hint">
      <span>当前主题: </span>
      <strong>{{
        availableThemes.find((t) => t.id === currentTheme)?.name || currentTheme
      }}</strong>
    </div>
  </div>
</template>

<style scoped>
.theme-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.section-desc {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: -8px 0 0 0;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 8px;
}

.theme-card {
  position: relative;
  padding: 16px;
  background-color: var(--theme-bg-secondary);
  border: 2px solid var(--theme-border);
  border-radius: var(--theme-radius);
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-card:hover {
  border-color: var(--theme-border-hover);
  box-shadow: var(--theme-shadow);
}

.theme-card.selected {
  border-color: var(--theme-accent);
  background-color: var(--theme-bg-tertiary);
}

.theme-preview {
  display: flex;
  gap: 4px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
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
  color: var(--theme-text);
}

.theme-desc {
  font-size: 12px;
  color: var(--theme-text-secondary);
  line-height: 1.4;
}

.selected-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background-color: var(--theme-accent);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.selected-indicator svg {
  width: 14px;
  height: 14px;
  color: white;
}

.current-theme-hint {
  padding: 12px 16px;
  background-color: var(--theme-bg-tertiary);
  border-radius: var(--theme-radius-sm);
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.current-theme-hint strong {
  color: var(--theme-accent);
}
</style>
