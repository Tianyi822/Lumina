<script setup lang="ts">
const emit = defineEmits<{
  upload: []
}>()
</script>

<template>
  <div class="paper-empty-state">
    <p class="paper-empty-state__eyebrow">论文阅读器</p>
    <h2 class="paper-empty-state__title">选择或上传论文</h2>
    <p class="paper-empty-state__description">
      从左侧选择一篇已处理的论文，或上传新的 PDF 文件开始。
    </p>
    <button class="sm-button sm-button--primary" @click="emit('upload')">上传 PDF</button>
  </div>
</template>

<style scoped>
.paper-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  max-width: 400px;
  margin: auto;
  padding: var(--sm-space-8) var(--sm-space-6);
  text-align: center;
  background: var(--sm-color-surface-2);
  border-radius: var(--sm-radius-lg);
}

.paper-empty-state__eyebrow {
  margin: 0 0 var(--sm-space-3);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.paper-empty-state__title {
  margin: 0 0 var(--sm-space-3);
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-empty-state__description {
  margin: 0 0 var(--sm-space-6);
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}
</style>
