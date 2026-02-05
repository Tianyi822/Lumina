# Pinia 状态管理重构总结

## 重构概述

本次重构成功将分散的 Vue Composables 状态管理迁移到 Pinia Store，解决了页面切换时状态丢失的问题。

## 主要改动

### 1. 新增文件

```
src/renderer/src/stores/
├── index.ts                    # Pinia 初始化与 Store 导出
├── types.ts                    # Store 共享类型定义
├── messageCacheStore.ts        # 消息缓存管理（支持多会话）
├── inputStateStore.ts          # 输入状态管理（含持久化）
├── chatStreamStore.ts          # 聊天流状态管理
├── sessionStore.ts             # 会话核心状态管理
└── uiStateStore.ts             # UI 状态管理（含持久化）
```

### 2. 修改的文件

| 文件                                       | 改动内容                           |
| ------------------------------------------ | ---------------------------------- |
| `src/renderer/src/main.ts`                 | 注册 Pinia 插件                    |
| `src/renderer/src/App.vue`                 | 使用 UIStateStore 替代 useUIState  |
| `src/renderer/src/pages/ChatPage.vue`      | 使用 Pinia Stores 替代 Composables |
| `src/renderer/src/components/TitleBar.vue` | 使用 UIStateStore 替代 props/emits |

## 核心问题解决方案

### 问题1：页面切换状态丢失

**解决方案**：在 `ChatPage.vue` 的 `onUnmounted` 钩子中调用 `saveCurrentStateBeforeLeave()`，在 `onMounted` 中调用 `restoreStateAfterReturn()`。

```typescript
// ChatPage.vue
onUnmounted(() => {
  // 在离开聊天页面前保存状态
  if (currentChatId.value) {
    sessionStore.saveCurrentStateBeforeLeave()
    uiStateStore.updateLastChatSessionId(currentChatId.value)
  }
})

onMounted(async () => {
  // 如果有上次访问的会话，恢复它
  if (uiStateStore.lastChatSessionId) {
    await sessionStore.restoreStateAfterReturn(uiStateStore.lastChatSessionId)
  }
})
```

### 问题2：已选工具/知识库丢失

**解决方案**：`InputStateStore` 使用 `pinia-plugin-persistedstate` 持久化 `sessionInputStates`，每个会话的输入状态都会被保存。

```typescript
// inputStateStore.ts
persist: {
  key: 'sparrow-input-state',
  pick: ['sessionInputStates', 'lastActiveSessionId']
}
```

### 问题3：正在生成的消息消失

**解决方案**：`MessageCacheStore` 缓存后台会话的消息状态，`ChatStreamStore` 处理流式事件时会更新缓存中的消息。

```typescript
// chatStreamStore.ts
function handleStreamEvent(event: StreamEvent, ...): void {
  // 非当前会话：从缓存获取或初始化
  if (!isCurrentSession) {
    const cached = messageCache.getCachedMessagesRef(targetSessionId)
    targetMessages = cached || []
  }
  // ... 处理事件
}
```

## Store 职责说明

### MessageCacheStore

- 管理多会话消息缓存
- 支持后台会话流式响应
- 提供缓存保存到磁盘的功能

### InputStateStore

- 管理每个会话的输入状态
- 包括：输入消息、选中模型、工具、知识库
- **持久化**：自动保存到 localStorage

### ChatStreamStore

- 管理聊天流状态
- 处理流式事件（content, reasoning, tool_call 等）
- 支持多会话并发
- **不持久化**：运行时状态

### SessionStore

- 整合所有会话相关状态
- 管理会话列表、当前会话、消息列表
- 提供会话操作（创建、加载、删除、切换）
- **不持久化**：从磁盘加载

### UIStateStore

- 管理 UI 状态（侧边栏、视图模式）
- 记录最后访问的聊天会话 ID
- **持久化**：UI 偏好设置

## 持久化策略

| Store             | 持久化 | 说明         |
| ----------------- | ------ | ------------ |
| InputStateStore   | ✅     | 会话输入状态 |
| UIStateStore      | ✅     | UI 偏好设置  |
| SessionStore      | ❌     | 从磁盘加载   |
| ChatStreamStore   | ❌     | 运行时状态   |
| MessageCacheStore | ❌     | 运行时缓存   |

## 向后兼容性

原有的 Composables 仍然保留，可以在需要时继续使用：

- `useSession()`
- `useSessionActions()`
- `useInputState()`
- `useChatStream()`
- `useMessageCache()`
- `useUIState()`

它们作为 Pinia Store 的包装层，保持 API 兼容。

## 验证结果

- ✅ 类型检查通过 (`yarn typecheck`)
- ✅ 代码规范检查通过 (`yarn lint`)
- ✅ 代码格式化 (`yarn format`)
- ✅ 项目构建成功 (`yarn build`)

## 使用建议

### 新代码使用 Pinia

```typescript
import { useSessionStore, useInputStateStore } from '@renderer/stores'

const sessionStore = useSessionStore()
const inputStateStore = useInputStateStore()

// 直接访问状态
console.log(sessionStore.currentChatId)
console.log(inputStateStore.selectedMCPTools)

// 调用 actions
await sessionStore.handleSelectChat(sessionId)
inputStateStore.updateSelectedTools(tools)
```

### 旧代码保持兼容

```typescript
import { useSessionActions } from '@renderer/composables/session/useSessionActions'
import { useChatStream } from '@renderer/composables/chat/useChatStream'

// 仍然可用
const chatStream = useChatStream()
const sessionActions = useSessionActions(chatStream)
```

## 后续优化建议

1. **单元测试**：为每个 Store 添加单元测试
2. **性能优化**：使用 `storeToRefs` 优化大型组件的响应式性能
3. **状态调试**：可以添加 Pinia 开发者工具支持
4. **Composables 迁移**：逐步将旧 Composables 完全迁移到 Store
