<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import styles from './LabToolsToggle.module.css'

const props = defineProps<{
  modelValue: boolean
  disabled?: boolean
  compact?: boolean
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
  window.api.logger.debug('[LabToolsToggle] 组件挂载', {
    enabled: isEnabled.value
  })
})
</script>

<template>
  <div
    :class="[
      styles['lab-tools-toggle'],
      {
        [styles['enabled']]: isEnabled,
        [styles['disabled']]: disabled,
        [styles['is-compact']]: props.compact
      }
    ]"
    @click="toggle"
  >
    <div :class="styles['toggle-switch']">
      <div :class="styles['toggle-thumb']"></div>
    </div>
    <span :class="styles['toggle-label']">实验室</span>
  </div>
</template>
