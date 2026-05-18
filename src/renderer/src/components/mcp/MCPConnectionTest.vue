<script setup lang="ts">
import styles from './MCPConnectionTest.module.css'

interface Props {
  testing: boolean
  result?: 'success' | 'error' | null
  message?: string
}

withDefaults(defineProps<Props>(), {
  result: null,
  message: ''
})
</script>

<template>
  <div v-if="testing" :class="[styles['connection-test'], styles.testing]">
    <span :class="styles['test-icon']">⏳</span>
    <span>测试中...</span>
  </div>
  <div
    v-else-if="result === 'success' && message"
    :class="[styles['connection-test'], styles.success]"
  >
    <span :class="styles['test-icon']">✓</span>
    <span>{{ message }}</span>
  </div>
  <div v-else-if="result === 'error' && message" :class="[styles['connection-test'], styles.error]">
    <span :class="styles['test-icon']">✗</span>
    <span>{{ message }}</span>
  </div>
</template>
