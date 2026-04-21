<script setup lang="ts">
defineProps<{
  translationMissingCount: number
  outdatedCount: number
  onRetranslate: () => void
  onViewInOriginal: () => void
}>()
</script>

<template>
  <section
    v-if="translationMissingCount > 0"
    class="paper-markdown-view__status-panel paper-markdown-view__status-panel--warning"
  >
    <div class="paper-markdown-view__status-title">译文已删除，但相关标注仍然保留</div>
    <p class="paper-markdown-view__status-text">
      {{ translationMissingCount }}
      条译文标注已自动降级到原文语义归属，重新翻译后可以继续恢复到译文视图。
    </p>
    <div class="paper-markdown-view__status-actions">
      <button class="sm-button sm-button--primary" type="button" @click="onRetranslate">
        重新翻译
      </button>
      <button class="sm-button sm-button--secondary" type="button" @click="onViewInOriginal">
        在原文中查看
      </button>
    </div>
  </section>

  <section
    v-if="outdatedCount > 0"
    class="paper-markdown-view__status-panel paper-markdown-view__status-panel--info"
  >
    <div class="paper-markdown-view__status-title">检测到基于旧版译文创建的标注</div>
    <p class="paper-markdown-view__status-text">
      当前共有 {{ outdatedCount }}
      条标注依赖旧译文版本。系统会优先保留原文归属，
      你可以直接更新到当前译文，或手动重新绑定到新的选区。
    </p>
  </section>
</template>

<style scoped>
.paper-markdown-view__status-panel {
  margin-bottom: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 16px;
  background: var(--sm-color-surface-1);
  padding: var(--sm-space-4);
}

.paper-markdown-view__status-panel--warning {
  background: linear-gradient(180deg, var(--sm-color-surface-1), var(--sm-color-surface-2));
}

.paper-markdown-view__status-panel--info {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--sm-color-accent-08) 70%, var(--sm-color-surface-1)),
    var(--sm-color-surface-1)
  );
}

.paper-markdown-view__status-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__status-text {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  margin-top: var(--sm-space-3);
}
</style>
