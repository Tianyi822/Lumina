<script setup lang="ts">
/**
 * 视图切换演示组件
 * 用于展示 Chat 和 知识库 之间的切换效果
 */

const props = defineProps<{
  viewMode: 'chat' | 'knowledge'
}>()
</script>

<template>
  <div class="view-demo">
    <!-- Chat 视图模拟 -->
    <div v-if="viewMode === 'chat'" class="demo-page chat-page">
      <div class="demo-sidebar">
        <div class="demo-sidebar-header">
          <div class="demo-btn">+ 新对话</div>
        </div>
        <div class="demo-chat-list">
          <div class="demo-chat-item active">
            <div class="demo-chat-title">示例对话 1</div>
            <div class="demo-chat-time">10:30</div>
          </div>
          <div class="demo-chat-item">
            <div class="demo-chat-title">示例对话 2</div>
            <div class="demo-chat-time">昨天</div>
          </div>
          <div class="demo-chat-item">
            <div class="demo-chat-title">示例对话 3</div>
            <div class="demo-chat-time">前天</div>
          </div>
        </div>
      </div>
      <div class="demo-main">
        <div class="demo-messages">
          <div class="demo-message user">
            <div class="demo-message-content">你好，这是一个示例消息</div>
          </div>
          <div class="demo-message assistant">
            <div class="demo-message-content">
              你好！这是 Chat 视图的模拟页面。点击上方的"知识库"切换视图查看滑块动效。
            </div>
          </div>
        </div>
        <div class="demo-input-area">
          <div class="demo-input">输入消息...</div>
          <div class="demo-send-btn">➤</div>
        </div>
      </div>
    </div>

    <!-- 知识库视图模拟 -->
    <div v-else class="demo-page knowledge-page">
      <div class="knowledge-sidebar">
        <div class="knowledge-sidebar-header">
          <div class="demo-btn">+ 新建知识库</div>
        </div>
        <div class="knowledge-list">
          <div class="knowledge-item active">
            <div class="knowledge-icon">📄</div>
            <div class="knowledge-info">
              <div class="knowledge-title">产品文档</div>
              <div class="knowledge-meta">128 个文档</div>
            </div>
          </div>
          <div class="knowledge-item">
            <div class="knowledge-icon">📚</div>
            <div class="knowledge-info">
              <div class="knowledge-title">技术规范</div>
              <div class="knowledge-meta">56 个文档</div>
            </div>
          </div>
          <div class="knowledge-item">
            <div class="knowledge-icon">📝</div>
            <div class="knowledge-info">
              <div class="knowledge-title">会议纪要</div>
              <div class="knowledge-meta">32 个文档</div>
            </div>
          </div>
        </div>
      </div>
      <div class="knowledge-main">
        <div class="knowledge-header">
          <h2 class="knowledge-title-large">产品文档</h2>
          <div class="knowledge-actions">
            <button class="demo-action-btn">上传文件</button>
            <button class="demo-action-btn primary">添加链接</button>
          </div>
        </div>
        <div class="knowledge-content">
          <div class="knowledge-placeholder">
            <div class="placeholder-icon-large">📚</div>
            <h3>这是知识库视图</h3>
            <p>点击上方的 "Chat" 切换回聊天视图查看滑块动效</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view-demo {
  width: 100%;
  height: 100%;
  background-color: var(--theme-bg);
}

/* 通用页面布局 */
.demo-page {
  display: flex;
  width: 100%;
  height: 100%;
}

/* ==================== Chat 页面样式 ==================== */
.demo-sidebar {
  width: 260px;
  background-color: var(--theme-bg);
  border-right: 1px solid var(--theme-border);
  display: flex;
  flex-direction: column;
}

.demo-sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--theme-border);
}

.demo-btn {
  padding: 8px 16px;
  background-color: var(--theme-accent);
  color: white;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
  cursor: pointer;
}

.demo-chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.demo-chat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  margin-bottom: 4px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.demo-chat-item:hover {
  background-color: var(--theme-bg-hover);
}

.demo-chat-item.active {
  background-color: var(--theme-bg-secondary);
}

.demo-chat-title {
  font-size: 13px;
  color: var(--theme-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.demo-chat-time {
  font-size: 11px;
  color: var(--theme-text-secondary);
  flex-shrink: 0;
  margin-left: 8px;
}

.demo-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--theme-bg);
}

.demo-messages {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.demo-message {
  max-width: 70%;
}

.demo-message.user {
  align-self: flex-end;
}

.demo-message.assistant {
  align-self: flex-start;
}

.demo-message-content {
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.demo-message.user .demo-message-content {
  background-color: var(--theme-accent);
  color: white;
}

.demo-message.assistant .demo-message-content {
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
  border: 1px solid var(--theme-border);
}

.demo-input-area {
  padding: 16px 24px;
  border-top: 1px solid var(--theme-border);
  display: flex;
  gap: 12px;
  align-items: center;
}

.demo-input {
  flex: 1;
  padding: 10px 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--theme-text-secondary);
}

.demo-send-btn {
  width: 36px;
  height: 36px;
  background-color: var(--theme-accent);
  color: white;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
}

/* ==================== 知识库页面样式 ==================== */
.knowledge-sidebar {
  width: 280px;
  background-color: var(--theme-bg);
  border-right: 1px solid var(--theme-border);
  display: flex;
  flex-direction: column;
}

.knowledge-sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--theme-border);
}

.knowledge-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.knowledge-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 4px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.knowledge-item:hover {
  background-color: var(--theme-bg-hover);
}

.knowledge-item.active {
  background-color: var(--theme-bg-secondary);
}

.knowledge-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--theme-bg-hover);
  border-radius: 8px;
}

.knowledge-info {
  flex: 1;
  min-width: 0;
}

.knowledge-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 2px;
}

.knowledge-meta {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.knowledge-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--theme-bg);
}

.knowledge-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--theme-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.knowledge-title-large {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.knowledge-actions {
  display: flex;
  gap: 8px;
}

.demo-action-btn {
  padding: 6px 14px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--theme-text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.demo-action-btn:hover {
  background-color: var(--theme-bg-hover);
}

.demo-action-btn.primary {
  background-color: var(--theme-accent);
  color: white;
  border-color: var(--theme-accent);
}

.demo-action-btn.primary:hover {
  opacity: 0.9;
}

.knowledge-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.knowledge-placeholder {
  text-align: center;
}

.placeholder-icon-large {
  font-size: 64px;
  margin-bottom: 16px;
}

.knowledge-placeholder h3 {
  font-size: 18px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.knowledge-placeholder p {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 0;
}
</style>
