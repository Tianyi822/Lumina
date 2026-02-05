# Pinia 状态管理重构方案

## 一、问题根源分析

### 1.1 当前状态管理架构的问题

#### 问题1：Composable 状态随组件销毁而丢失

当前架构中，ChatPage.vue 使用 `useSessionActions()` 和 `useChatStream()` 等 composables 管理状态：

```typescript
// ChatPage.vue
const chatStream = useChatStream()
const sessionActions = useSessionActions(chatStream)
```

当用户切换到 KnowledgePage 时，ChatPage 组件被销毁 (`v-if="currentView === 'chat'"`)，导致：

- 所有 composable 实例被销毁
- `sessionMessagesCache`、`sessionInputStates` 等状态丢失
- 正在生成的消息流状态消失

#### 问题2：状态分散在多个 Composables 中

```
useSession.ts          - 会话基础数据（currentSession, messages）
useSessionActions.ts   - 会话操作逻辑（封装了 useSession + useInputState + useMessageCache）
useInputState.ts       - 输入状态（工具选择、知识库选择、输入消息）
useChatStream.ts       - 聊天流状态（isSending, sessionSendingStates）
useMessageCache.ts     - 消息缓存（sessionMessagesCache）
```

这些 composables 之间通过参数传递和引用耦合，导致：

- 状态同步复杂
- 难以追踪状态变化
- 循环依赖风险

#### 问题3：页面切换没有状态持久化机制

App.vue 中的视图切换：

```vue
<ChatPage v-if="currentView === 'chat'" />
<KnowledgePage v-else />
```

这种 `v-if` 切换会导致组件完全销毁和重建，而当前没有全局状态存储机制来保留：

- 正在生成的消息内容
- 已选择的工具
- 已选择的知识库
- 流式响应状态

### 1.2 具体问题场景分析

| 问题                   | 根本原因                              | 影响                         |
| ---------------------- | ------------------------------------- | ---------------------------- |
| 正在生成的消息消失     | ChatPage 销毁导致 `messages` ref 丢失 | 用户丢失正在生成的内容       |
| 已选工具需要重新选择   | `useInputState` 实例销毁              | 降低用户体验                 |
| 状态变化未反映到UI     | 响应式链断裂                          | 界面与数据不一致             |
| 日志有输出但页面无显示 | 事件监听器随组件销毁                  | 状态更新无法传递到已销毁组件 |

## 二、Pinia 重构方案

### 2.1 架构设计原则

1. **单一数据源**：所有会话相关状态集中管理
2. **响应式保持**：利用 Pinia 的响应式系统
3. **持久化支持**：使用 pinia-plugin-persistedstate
4. **模块化设计**：按功能领域划分 store
5. **向后兼容**：保持现有 API 不变，逐步迁移

### 2.2 Store 模块设计

```
stores/
├── index.ts                    # Store 入口，初始化 Pinia
├── sessionStore.ts             # 会话核心状态管理
├── chatStreamStore.ts          # 聊天流状态管理
├── inputStateStore.ts          # 输入状态管理
├── messageCacheStore.ts        # 消息缓存管理（支持多会话）
├── uiStateStore.ts             # UI 状态管理
└── types.ts                    # Store 共享类型
```

### 2.3 状态映射关系

| 当前 Composable | 目标 Store        | 主要状态                                            |
| --------------- | ----------------- | --------------------------------------------------- |
| useSession      | sessionStore      | currentSession, sessionList, messages               |
| useChatStream   | chatStreamStore   | isSending, sessionSendingStates, streamingSessionId |
| useInputState   | inputStateStore   | sessionInputStates, currentInputState               |
| useMessageCache | messageCacheStore | sessionMessagesCache, sessionTitleCache             |
| useUIState      | uiStateStore      | sidebarCollapsed, currentView, currentModel         |

## 三、实施计划

### 阶段1：基础设施搭建

1. 创建 `src/renderer/src/stores/` 目录结构
2. 配置 Pinia 插件和持久化
3. 定义共享类型

### 阶段2：Store 实现

按依赖顺序实现各 Store：

1. `messageCacheStore`（最底层，被其他 store 依赖）
2. `inputStateStore`
3. `chatStreamStore`
4. `sessionStore`（整合上述 stores）
5. `uiStateStore`

### 阶段3：组件迁移

1. 修改 `main.ts` 注册 Pinia
2. 修改 `App.vue` 使用新的 UI Store
3. 重构 `ChatPage.vue` 使用 Session Store
4. 逐步替换其他 composables 的使用

### 阶段4：Composables 适配层

为了保持向后兼容性，保留 composables 作为 Store 的包装：

```typescript
// useSession.ts 修改为：
export function useSession() {
  const sessionStore = useSessionStore()
  // 返回与原来相同的接口，但内部使用 store
  return {
    currentSession: computed(() => sessionStore.currentSession)
    // ...
  }
}
```

## 四、核心 Store 设计

### 4.1 MessageCacheStore

负责多会话消息缓存，支持后台会话流式响应。

```typescript
export const useMessageCacheStore = defineStore('messageCache', () => {
  // State
  const sessionMessagesCache = ref<Map<string, Message[]>>(new Map())
  const sessionTitleCache = ref<Map<string, string>>(new Map())

  // Actions
  function cacheSession(sessionId: string, messages: Message[], title?: string)
  function getCachedSession(sessionId: string, returnRef?: boolean)
  function clearSessionCache(sessionId: string)
  async function saveCachedSession(sessionId: string)

  return { sessionMessagesCache, sessionTitleCache, ... }
})
```

### 4.2 InputStateStore

管理每个会话的输入状态。

```typescript
export const useInputStateStore = defineStore('inputState', () => {
  // State
  const sessionInputStates = ref<Map<string, SessionInputState>>(new Map())
  const currentInputState = ref<SessionInputState>({
    inputMessage: '',
    selectedModel: '',
    selectedMCPTools: [],
    selectedKnowledgeBases: []
  })

  // Actions
  function saveCurrentState(sessionId: string)
  function switchToSession(sessionId: string)
  function updateSelectedTools(tools: MCPTool[])
  // ...

  // Persistence: 只持久化 sessionInputStates
})
```

### 4.3 ChatStreamStore

管理聊天流状态，包括多会话并发。

```typescript
export const useChatStreamStore = defineStore('chatStream', () => {
  // State
  const isSending = ref(false)
  const sessionSendingStates = ref<Map<string, boolean>>(new Map())
  const streamingSessionId = ref<string | null>(null)
  const messagesSnapshot = ref<Message[] | null>(null)

  // Actions
  function handleStreamEvent(event: StreamEvent, cache: Map<string, Message[]>)
  function setSessionSendingState(sessionId: string, state: boolean)
  async function stopRequest(sessionId?: string)

  // 不持久化（运行时状态）
})
```

### 4.4 SessionStore（核心）

整合所有会话相关状态。

```typescript
export const useSessionStore = defineStore('session', () => {
  // 依赖其他 stores
  const messageCache = useMessageCacheStore()
  const inputState = useInputStateStore()
  const chatStream = useChatStreamStore()

  // State
  const currentSession = ref<SessionData | null>(null)
  const currentChatId = ref<string | undefined>(undefined)
  const messages = ref<Message[]>([])
  const sessionList = ref<SessionListItem[]>([])
  const sessionUpdateKey = ref(0)

  // Actions
  async function loadSession(sessionId: string)
  async function createSession(title?: string, sessionType?: SessionType)
  async function handleSelectChat(sessionId: string): Promise<boolean>
  // ...

  // 页面切换时自动保存
  function saveCurrentStateBeforeLeave()
})
```

## 五、持久化策略

### 5.1 需要持久化的状态

```typescript
// pinia-plugin-persistedstate 配置
const persistConfig = {
  // inputStateStore - 持久化输入状态
  inputState: {
    paths: ['sessionInputStates'] // 不持久化 currentInputState（运行时状态）
  },
  // uiStateStore - 持久化 UI 偏好
  uiState: {
    paths: ['sidebarCollapsed', 'currentView']
  },
  // sessionStore - 不持久化（从磁盘加载）
  session: false,
  // chatStreamStore - 不持久化（运行时状态）
  chatStream: false,
  // messageCacheStore - 不持久化（运行时缓存）
  messageCache: false
}
```

### 5.2 页面切换状态保存机制

```typescript
// App.vue 中监听视图变化
watch(currentView, (newView, oldView) => {
  if (oldView === 'chat' && newView !== 'chat') {
    // 离开聊天页面时保存状态
    sessionStore.saveCurrentStateBeforeLeave()
  }
})
```

## 六、风险评估与缓解

### 6.1 风险点

| 风险           | 可能性 | 影响 | 缓解措施                              |
| -------------- | ------ | ---- | ------------------------------------- |
| 状态同步问题   | 中     | 高   | 完善单元测试，逐步迁移                |
| 性能下降       | 低     | 中   | 使用 computed，避免不必要的响应式追踪 |
| 持久化数据损坏 | 低     | 高   | 添加数据校验和版本控制                |
| 向后兼容性破坏 | 中     | 高   | 保留 composables 作为适配层           |

### 6.2 测试策略

1. **单元测试**：每个 store 的 actions 和 getters
2. **集成测试**：store 之间的交互
3. **E2E测试**：页面切换场景

## 七、时间安排

| 阶段     | 任务                | 预计时间   |
| -------- | ------------------- | ---------- |
| 1        | 基础设施搭建        | 2小时      |
| 2        | MessageCacheStore   | 1小时      |
| 3        | InputStateStore     | 1小时      |
| 4        | ChatStreamStore     | 2小时      |
| 5        | SessionStore        | 3小时      |
| 6        | UIStateStore & 迁移 | 2小时      |
| 7        | 持久化配置          | 1小时      |
| 8        | 测试与验证          | 2小时      |
| **总计** |                     | **14小时** |

## 八、迁移检查清单

- [ ] Store 基础设施搭建完成
- [ ] MessageCacheStore 实现并通过测试
- [ ] InputStateStore 实现并通过测试
- [ ] ChatStreamStore 实现并通过测试
- [ ] SessionStore 实现并通过测试
- [ ] UIStateStore 实现
- [ ] App.vue 迁移完成
- [ ] ChatPage.vue 迁移完成
- [ ] 持久化配置完成
- [ ] 页面切换测试通过
- [ ] 多会话并发测试通过
- [ ] 工具选择状态持久化测试通过
- [ ] 知识库选择状态持久化测试通过
