# Pinia Store 测试指南

## 手动测试步骤

### 测试1：页面切换状态保持

1. 打开应用，进入 Chat 页面
2. 选择一个会话并开始聊天
3. 在消息生成过程中，切换到 Knowledge 页面
4. 等待几秒钟，再切换回 Chat 页面
5. **预期结果**：
   - 正在生成的消息继续显示
   - 已选择的工具保持选中状态
   - 已选择的知识库保持选中状态
   - 输入框内容保持不变

### 测试2：多会话状态隔离

1. 在 Chat 页面创建两个会话
2. 在会话 A 中输入一些文字，选择一些工具
3. 切换到会话 B，输入不同的文字，选择不同的工具
4. 切换回会话 A
5. **预期结果**：
   - 会话 A 显示之前输入的文字和选中的工具
   - 会话 B 的状态不会影响到会话 A

### 测试3：持久化验证

1. 在 Chat 页面中选择一个会话
2. 选择一些工具和知识库
3. 完全关闭应用
4. 重新打开应用
5. **预期结果**：
   - 工具和知识库的选择状态被恢复
   - 上次访问的会话被自动加载

### 测试4：流式消息缓存

1. 开始一个长对话
2. 在消息生成过程中切换到 Knowledge 页面
3. 在后台等待消息生成完成
4. 切换回 Chat 页面
5. **预期结果**：
   - 完整的消息内容被显示
   - 消息状态为已完成（非流式）

## 日志检查

在测试过程中，检查日志输出以确认状态管理正常工作：

```
# 页面切换时应该看到
[ChatPage] 组件卸载，清理资源
[SessionStore] 保存当前状态（页面切换前）
[UIStateStore] 切换到知识库视图

# 返回时应该看到
[UIStateStore] 切换到聊天视图
[ChatPage] 组件挂载，初始化聊天页面
[ChatPage] 恢复上次会话成功
[SessionStore] 从缓存加载会话
[InputStateStore] 恢复会话输入状态
```

## 调试技巧

### 查看 Pinia Store 状态

在 DevTools 控制台中：

```javascript
// 访问 Store 实例
const { useSessionStore } = require('./src/renderer/src/stores')
const sessionStore = useSessionStore()

// 查看状态
console.log(sessionStore.currentChatId)
console.log(sessionStore.messages)

// 查看缓存
const { useMessageCacheStore } = require('./src/renderer/src/stores')
const cacheStore = useMessageCacheStore()
console.log(cacheStore.sessionMessagesCache)
```

### 检查持久化数据

在 DevTools 的 Application 标签中查看 Local Storage：

- `sparrow-input-state`：输入状态
- `sparrow-ui-state`：UI 状态

### 手动清除持久化数据

```javascript
// 清除所有 Pinia 持久化数据
localStorage.removeItem('sparrow-input-state')
localStorage.removeItem('sparrow-ui-state')
location.reload()
```

## 常见问题排查

### 状态未正确恢复

1. 检查日志中是否有 `[SessionStore] 恢复状态（页面返回后）` 的输出
2. 检查 `lastChatSessionId` 是否正确存储
3. 检查 `sessionInputStates` 中是否包含对应会话的状态

### 工具选择丢失

1. 检查日志中是否有 `[InputStateStore] 保存输入状态`
2. 检查 localStorage 中 `sparrow-input-state` 的值
3. 确认工具对象是否包含所有必要字段（name, serverName）

### 消息缓存不生效

1. 检查日志中是否有 `[MessageCacheStore] 缓存会话状态`
2. 检查 `sessionMessagesCache` 的大小和内容
3. 确认消息对象是否包含 `isStreaming` 字段
