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

function toggle(): void {
  if (!props.disabled) {
    isEnabled.value = !isEnabled.value
    emit('update:modelValue', isEnabled.value)
    emit('change', isEnabled.value)
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
      <div class="toggle-thumb"></div>
    </div>
    <span class="toggle-label">沙箱</span>
  </div>
</template>

<style scoped>
.sandbox-tools-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12px;
  background-color: var(--sm-color-surface-1);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-sm);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
  user-select: none;
}

.sandbox-tools-toggle:hover:not(.disabled) {
  border-color: var(--sm-color-border-strong);
  background-color: var(--sm-color-surface-hover);
}

.sandbox-tools-toggle.enabled {
  border-color: var(--sm-color-border-accent);
  background-color: rgba(142, 149, 217, 0.08);
}

.sandbox-tools-toggle.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toggle-switch {
  width: 36px;
  height: 20px;
  background-color: var(--sm-color-border-default);
  border-radius: 10px;
  position: relative;
  transition: background-color 0.2s ease;
}

.sandbox-tools-toggle.enabled .toggle-switch {
  background-color: var(--sm-color-accent);
}

.toggle-thumb {
  width: 16px;
  height: 16px;
  background-color: var(--sm-color-text-primary);
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  color: var(--sm-color-text-secondary);
}

.sandbox-tools-toggle.enabled .toggle-thumb {
  transform: translateX(16px);
  color: var(--sm-color-accent-hover);
}

.toggle-label {
  font-size: 12px;
  color: var(--sm-color-text-primary);
  font-weight: 500;
}
</style>
