<script setup lang="ts">
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
  <div v-if="testing" class="connection-test testing">
    <span class="test-icon">⏳</span>
    <span>测试中...</span>
  </div>
  <div v-else-if="result === 'success' && message" class="connection-test success">
    <span class="test-icon">✓</span>
    <span>{{ message }}</span>
  </div>
  <div v-else-if="result === 'error' && message" class="connection-test error">
    <span class="test-icon">✗</span>
    <span>{{ message }}</span>
  </div>
</template>

<style scoped>
.connection-test {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.connection-test.testing {
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--theme-text-secondary);
}

.connection-test.success {
  background-color: rgba(63, 185, 80, 0.1);
  color: var(--theme-success);
}

.connection-test.error {
  background-color: rgba(248, 81, 73, 0.1);
  color: var(--theme-danger);
}

.test-icon {
  font-weight: bold;
  font-size: 1rem;
}
</style>
