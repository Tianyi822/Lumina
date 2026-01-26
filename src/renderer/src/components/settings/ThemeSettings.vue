<script setup lang="ts">
import { reactive } from 'vue'

interface ThemeColors {
  background: string
  backgroundSecondary: string
  text: string
  textSecondary: string
  accent: string
  border: string
}

interface ThemeConfig {
  name: string
  colors?: ThemeColors
}

interface Props {
  modelValue: ThemeConfig
}

interface Emits {
  (e: 'update:modelValue', value: ThemeConfig): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const themeConfig = reactive(props.modelValue)

// 监听变化并同步
function updateTheme(): void {
  emit('update:modelValue', { ...themeConfig })
}
</script>

<template>
  <div class="tab-content">
    <div class="form-group">
      <label>主题名称</label>
      <select v-model="themeConfig.name" class="input" @change="updateTheme">
        <option value="terminal">Terminal (终端)</option>
      </select>
    </div>

    <h3 class="form-section-title">颜色配置</h3>
    <div class="color-grid">
      <div class="form-group">
        <label>主背景色</label>
        <div class="color-input-wrapper">
          <input
            v-model="themeConfig.colors!.background"
            type="color"
            class="color-picker"
            @input="updateTheme"
          />
          <input
            v-model="themeConfig.colors!.background"
            type="text"
            class="input color-text"
            @input="updateTheme"
          />
        </div>
      </div>
      <div class="form-group">
        <label>次级背景色</label>
        <div class="color-input-wrapper">
          <input
            v-model="themeConfig.colors!.backgroundSecondary"
            type="color"
            class="color-picker"
            @input="updateTheme"
          />
          <input
            v-model="themeConfig.colors!.backgroundSecondary"
            type="text"
            class="input color-text"
            @input="updateTheme"
          />
        </div>
      </div>
      <div class="form-group">
        <label>主文字颜色</label>
        <div class="color-input-wrapper">
          <input
            v-model="themeConfig.colors!.text"
            type="color"
            class="color-picker"
            @input="updateTheme"
          />
          <input
            v-model="themeConfig.colors!.text"
            type="text"
            class="input color-text"
            @input="updateTheme"
          />
        </div>
      </div>
      <div class="form-group">
        <label>次级文字颜色</label>
        <div class="color-input-wrapper">
          <input
            v-model="themeConfig.colors!.textSecondary"
            type="color"
            class="color-picker"
            @input="updateTheme"
          />
          <input
            v-model="themeConfig.colors!.textSecondary"
            type="text"
            class="input color-text"
            @input="updateTheme"
          />
        </div>
      </div>
      <div class="form-group">
        <label>强调色</label>
        <div class="color-input-wrapper">
          <input
            v-model="themeConfig.colors!.accent"
            type="color"
            class="color-picker"
            @input="updateTheme"
          />
          <input
            v-model="themeConfig.colors!.accent"
            type="text"
            class="input color-text"
            @input="updateTheme"
          />
        </div>
      </div>
      <div class="form-group">
        <label>边框颜色</label>
        <div class="color-input-wrapper">
          <input
            v-model="themeConfig.colors!.border"
            type="color"
            class="color-picker"
            @input="updateTheme"
          />
          <input
            v-model="themeConfig.colors!.border"
            type="text"
            class="input color-text"
            @input="updateTheme"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 20px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.color-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-picker {
  width: 40px;
  height: 36px;
  padding: 2px;
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.color-text {
  flex: 1;
}
</style>
