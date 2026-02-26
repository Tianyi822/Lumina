<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  modelValue: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: boolean): void
}>()

const isEnabled = ref(props.modelValue)

// 同步 props 到本地状态
watch(
  () => props.modelValue,
  (newVal) => {
    isEnabled.value = newVal
  }
)

// 当本地状态变化时，同步到父组件
watch(isEnabled, (newVal) => {
  emit('update:modelValue', newVal)
  emit('change', newVal)
})

function toggle(): void {
  if (!props.disabled) {
    isEnabled.value = !isEnabled.value
  }
}

onMounted(() => {
  window.api.logger.debug('[SandboxToolsToggle] 组件挂载', {
    enabled: isEnabled.value
  })
})
</script>

<template>
  <div
    class="sandbox-tools-toggle"
    :class="{ enabled: isEnabled, disabled: disabled }"
    @click="toggle"
  >
    <div class="toggle-switch">
      <div class="toggle-thumb">
        <svg v-if="isEnabled" viewBox="0 0 1024 1024" width="12" height="12">
          <path
            d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"
            fill="currentColor"
          />
          <path
            d="M512 336m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 176m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 176m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0"
            fill="currentColor"
          />
        </svg>
        <svg v-else viewBox="0 0 1024 1024" width="12" height="12">
          <path
            d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"
            fill="currentColor"
          />
          <path
            d="M512 336m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 176m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0zm0 176m-40 0a40 40 0 1 0 80 0 40 40 0 1 0-80 0"
            fill="currentColor"
            opacity="0.3"
          />
        </svg>
      </div>
    </div>
    <span class="toggle-label">启用沙箱管理</span>
    <span v-if="isEnabled" class="status-badge active">已启用</span>
    <span v-else class="status-badge">已禁用</span>
  </div>
</template>

<style scoped>
.sandbox-tools-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius-sm);
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  user-select: none;
}

.sandbox-tools-toggle:hover:not(.disabled) {
  border-color: var(--theme-border-hover);
  background-color: var(--theme-bg-hover);
}

.sandbox-tools-toggle.enabled {
  border-color: var(--theme-accent);
  background-color: rgba(52, 122, 115, 0.1);
}

.sandbox-tools-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-switch {
  width: 36px;
  height: 20px;
  background-color: var(--theme-border);
  border-radius: 10px;
  position: relative;
  transition: background-color 0.2s ease;
}

.sandbox-tools-toggle.enabled .toggle-switch {
  background-color: var(--theme-accent);
}

.toggle-thumb {
  width: 16px;
  height: 16px;
  background-color: white;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  color: var(--theme-text-secondary);
}

.sandbox-tools-toggle.enabled .toggle-thumb {
  transform: translateX(16px);
  color: var(--theme-accent);
}

.toggle-label {
  font-size: 12px;
  color: var(--theme-text);
  font-weight: 500;
}

.status-badge {
  font-size: 11px;
  padding: 1px 6px;
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  color: var(--theme-text-secondary);
  min-width: 18px;
  text-align: center;
}

.status-badge.active {
  background-color: var(--theme-accent);
  border-color: transparent;
  color: white;
}
</style>
