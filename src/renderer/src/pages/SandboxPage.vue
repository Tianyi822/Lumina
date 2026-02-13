<script setup lang="ts">
// 沙箱页面
</script>

<template>
  <div class="sandbox-page">
    <div class="sandbox-container">
      <h1>沙箱</h1>
      <p>沙箱功能开发中...</p>
    </div>
  </div>
</template>

<style scoped>
.sandbox-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sandbox-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.sandbox-container h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--theme-text);
  margin-bottom: 12px;
}

.sandbox-container p {
  font-size: 14px;
  color: var(--theme-text-secondary);
}
</style>
