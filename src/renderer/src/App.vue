<script setup lang="ts">
import { ref, onMounted } from 'vue'

// 配置加载错误信息
const configError = ref<string | null>(null)
// 是否显示错误提示
const showError = ref(false)

/**
 * 加载配置状态
 * 只有在配置加载失败（如格式错误、权限问题等）时才显示错误
 */
async function loadConfigStatus(): Promise<void> {
  try {
    const status = await window.api.config.getStatus()

    // 只有在配置加载失败时才显示错误（配置不存在时会自动创建，不需要提示）
    if (!status.success && status.error) {
      configError.value = status.error
      showError.value = true
    }
  } catch (error) {
    configError.value = `无法获取配置状态: ${error instanceof Error ? error.message : String(error)}`
    showError.value = true
  }
}

/**
 * 关闭错误提示
 */
function dismissError(): void {
  showError.value = false
}

onMounted(() => {
  loadConfigStatus()
})
</script>

<template>
  <div class="app-container">
    <!-- 配置加载错误提示（仅在加载失败时显示） -->
    <div v-if="showError" class="error-banner">
      <div class="error-content">
        <span class="error-icon">⚠️</span>
        <span class="error-message">{{ configError }}</span>
        <button class="error-dismiss" @click="dismissError">×</button>
      </div>
    </div>

    <div class="main-content">
      <h1>麻雀手稿</h1>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 错误提示样式 */
.error-banner {
  background-color: #fef2f2;
  border-bottom: 1px solid #fecaca;
  padding: 12px 16px;
  flex-shrink: 0;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 1200px;
  margin: 0 auto;
}

.error-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.error-message {
  flex: 1;
  color: #991b1b;
  font-size: 14px;
  line-height: 1.5;
}

.error-dismiss {
  background: none;
  border: none;
  font-size: 20px;
  color: #991b1b;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.error-dismiss:hover {
  opacity: 1;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
