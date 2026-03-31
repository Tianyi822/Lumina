<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import ChatList from '@renderer/components/ChatList.vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import SandboxList from '@renderer/components/sandbox/SandboxList.vue'
import WorkspaceSidebarChrome from '@renderer/components/chrome/WorkspaceSidebarChrome.vue'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import {
  useChatStreamStore,
  useKnowledgeStore,
  useSessionStore,
  useSandboxStore,
  useUIStateStore
} from '@renderer/stores'

const uiStateStore = useUIStateStore()
const sessionStore = useSessionStore()
const chatStreamStore = useChatStreamStore()
const knowledgeStore = useKnowledgeStore()
const sandboxStore = useSandboxStore()

const { currentView, isCurrentSidebarCollapsed } = storeToRefs(uiStateStore)
const { sessionList, currentChatId } = storeToRefs(sessionStore)
const { knowledgeBases, activeKbId } = storeToRefs(knowledgeStore)
const { currentSandbox, sandboxList, deleteConfirmState } = storeToRefs(sandboxStore)

const chatSearchQuery = ref('')
const knowledgeSearchQuery = ref('')
const sandboxSearchQuery = ref('')
const isRefreshingSandboxList = ref(false)

const filteredSessions = computed(() => {
  if (!chatSearchQuery.value.trim()) {
    return sessionList.value
  }

  const query = chatSearchQuery.value.toLowerCase()
  return sessionList.value.filter((session) => session.title.toLowerCase().includes(query))
})

const filteredKnowledgeBases = computed(() => {
  if (!knowledgeSearchQuery.value.trim()) {
    return knowledgeBases.value
  }

  const query = knowledgeSearchQuery.value.toLowerCase()
  return knowledgeBases.value.filter(
    (kb) =>
      kb.name.toLowerCase().includes(query) ||
      (kb.description && kb.description.toLowerCase().includes(query))
  )
})

const filteredSandboxs = computed(() => {
  if (!sandboxSearchQuery.value.trim()) {
    return sandboxList.value
  }

  const query = sandboxSearchQuery.value.toLowerCase()
  return sandboxList.value.filter((sandbox) => sandbox.name.toLowerCase().includes(query))
})

const sidebarCount = computed(() => {
  if (currentView.value === 'chat') {
    return sessionList.value.length
  }

  if (currentView.value === 'knowledge') {
    return knowledgeBases.value.length
  }

  return sandboxList.value.length
})

const deletingSandboxId = computed(() => {
  return deleteConfirmState.value.isDeleting ? deleteConfirmState.value.sandboxId : null
})

function handleDeleteSession(sessionId: string): void {
  void sessionStore.handleDeleteSession(sessionId)
}

async function handleNewChat(): Promise<void> {
  await sessionStore.handleNewChat()

  const newSessionId = currentChatId.value
  if (newSessionId) {
    chatStreamStore.setSessionSendingState(newSessionId, false, true)
  }
}

async function handleSelectChat(sessionId: string): Promise<void> {
  const isSending = await sessionStore.handleSelectChat(sessionId)
  chatStreamStore.setSessionSendingState(sessionId, isSending, true)
}

function handleSelectKnowledgeBase(kbId: string): void {
  knowledgeStore.setActiveKb(kbId)
}

function handleCreateKnowledgeBase(): void {
  knowledgeStore.openCreateForm()
}

function handleManageKnowledgeFiles(): void {
  uiStateStore.openKnowledgeFileManager()
}

async function handleDeleteKnowledgeBase(kbId: string): Promise<void> {
  if (!confirm('确定要删除这个知识库吗？此操作不可撤销。')) {
    return
  }

  const success = await knowledgeStore.deleteKnowledgeBase(kbId)
  if (!success) {
    alert(`删除知识库失败: ${knowledgeStore.error || '未知错误'}`)
  }
}

function formatDocumentCount(linkedFileIds?: string[]): string {
  const count = linkedFileIds?.length || 0
  if (count === 0) return '0 个文档'
  if (count === 1) return '1 个文档'
  return `${count} 个文档`
}

function handleOpenSandboxCreator(): void {
  uiStateStore.openSandboxCreator()
}

function handleOpenConfigManager(): void {
  uiStateStore.openConfigManager()
}

function handleSelectSandbox(sandboxId: string): void {
  void sandboxStore.handleSelectSandbox(sandboxId)
}

function handleDeleteSandbox(sandboxId: string): void {
  void sandboxStore.handleDeleteSandbox(sandboxId)
}

async function handleRefreshSandboxList(): Promise<void> {
  if (isRefreshingSandboxList.value) {
    return
  }

  isRefreshingSandboxList.value = true

  try {
    await sandboxStore.refreshSandboxList()

    if (currentSandbox.value?.sandboxId) {
      await sandboxStore.loadSandbox(currentSandbox.value.sandboxId, true)
    }
  } finally {
    isRefreshingSandboxList.value = false
  }
}
</script>

<template>
  <div class="sm-sidebar-frame" :class="{ 'is-collapsed': isCurrentSidebarCollapsed }">
    <aside class="sm-sidebar-shell sm-workspace-sidebar-host">
      <WorkspaceSidebarChrome :count="sidebarCount" :actions-key="currentView">
        <template #actions>
          <template v-if="currentView === 'chat'">
            <button
              class="sm-button sm-button--primary sm-workspace-sidebar-host__action"
              @click="handleNewChat"
            >
              创建智能体
            </button>
          </template>

          <template v-else-if="currentView === 'knowledge'">
            <button
              class="sm-button sm-button--primary sm-workspace-sidebar-host__action"
              @click="handleCreateKnowledgeBase"
            >
              新建知识库
            </button>
            <button
              class="sm-button sm-button--secondary sm-workspace-sidebar-host__action"
              @click="handleManageKnowledgeFiles"
            >
              管理文件
            </button>
          </template>

          <template v-else>
            <button
              class="sm-button sm-button--primary sm-workspace-sidebar-host__action"
              @click="handleOpenSandboxCreator"
            >
              新建沙箱
            </button>
            <button
              class="sm-button sm-button--secondary sm-workspace-sidebar-host__action"
              @click="handleOpenConfigManager"
            >
              管理配置
            </button>
          </template>
        </template>
      </WorkspaceSidebarChrome>

      <div class="sm-workspace-sidebar-host__viewport">
        <div class="sm-workspace-sidebar-host__panel">
          <Transition name="sm-sidebar-search-switch" mode="out-in" appear>
            <div
              :key="`search-${currentView}`"
              class="sm-sidebar-shell__search sm-workspace-sidebar-host__search"
            >
              <template v-if="currentView === 'chat'">
                <input
                  v-model="chatSearchQuery"
                  type="text"
                  class="sm-input"
                  placeholder="搜索会话"
                />
              </template>

              <template v-else-if="currentView === 'knowledge'">
                <input
                  v-model="knowledgeSearchQuery"
                  type="text"
                  class="sm-input"
                  placeholder="搜索知识库"
                />
              </template>

              <template v-else>
                <div class="sm-workspace-sidebar-host__search--sandbox">
                  <input
                    v-model="sandboxSearchQuery"
                    type="text"
                    class="sm-input"
                    placeholder="搜索沙箱"
                  />
                  <button
                    class="sm-icon-button sm-workspace-sidebar-host__refresh-button"
                    title="刷新列表"
                    :disabled="isRefreshingSandboxList"
                    @click="handleRefreshSandboxList"
                  >
                    <SvgIcon name="refresh" :size="14" :spin="isRefreshingSandboxList" />
                  </button>
                </div>
              </template>
            </div>
          </Transition>

          <Transition name="sm-sidebar-body-switch" mode="out-in" appear>
            <div
              :key="`body-${currentView}`"
              class="sm-sidebar-shell__body sm-sidebar-shell__body--flush sm-workspace-sidebar-host__body"
            >
              <template v-if="currentView === 'chat'">
                <ChatList
                  :sessions="filteredSessions"
                  :active-session-id="currentChatId"
                  @select="handleSelectChat"
                  @delete="handleDeleteSession"
                />
              </template>

              <template v-else-if="currentView === 'knowledge'">
                <div class="sm-workspace-sidebar-host__kb-list">
                  <TransitionGroup
                    v-if="filteredKnowledgeBases.length > 0"
                    name="sm-sidebar-list-item"
                    tag="div"
                    appear
                  >
                    <div
                      v-for="(kb, index) in filteredKnowledgeBases"
                      :key="kb.id"
                      :class="[
                        'sm-workspace-sidebar-host__kb-item',
                        { 'is-active': kb.id === activeKbId }
                      ]"
                      :style="getSidebarListItemMotionStyle(index)"
                      @click="handleSelectKnowledgeBase(kb.id)"
                    >
                      <div class="sm-workspace-sidebar-host__kb-icon">
                        {{ kb.name.charAt(0).toUpperCase() }}
                      </div>

                      <div class="sm-workspace-sidebar-host__kb-info">
                        <div class="sm-workspace-sidebar-host__kb-name">{{ kb.name }}</div>
                        <div class="sm-workspace-sidebar-host__kb-meta">
                          {{ formatDocumentCount(kb.linkedFileIds) }}
                        </div>
                      </div>

                      <button
                        class="sm-workspace-sidebar-host__kb-delete"
                        title="删除知识库"
                        @click.stop="handleDeleteKnowledgeBase(kb.id)"
                      >
                        ✕
                      </button>
                    </div>
                  </TransitionGroup>

                  <div v-else class="sm-workspace-sidebar-host__empty">
                    <div class="sm-workspace-sidebar-host__empty-text">
                      {{ knowledgeSearchQuery ? '未找到匹配的知识库' : '暂无知识库' }}
                    </div>
                    <button
                      v-if="!knowledgeSearchQuery"
                      class="sm-button sm-button--secondary sm-button--small"
                      @click="handleCreateKnowledgeBase"
                    >
                      创建第一个知识库
                    </button>
                  </div>
                </div>
              </template>

              <template v-else>
                <SandboxList
                  :sandboxs="filteredSandboxs"
                  :active-sandbox-id="currentSandbox?.sandboxId"
                  :deleting-sandbox-id="deletingSandboxId"
                  @select="handleSelectSandbox"
                  @delete="handleDeleteSandbox"
                />
              </template>
            </div>
          </Transition>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.sm-workspace-sidebar-host {
  position: relative;
}

.sm-workspace-sidebar-host__action {
  width: 100%;
  min-height: 36px;
}

.sm-workspace-sidebar-host__viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.sm-workspace-sidebar-host__panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sm-workspace-sidebar-host__search {
  display: flex;
}

.sm-workspace-sidebar-host__search--sandbox {
  display: flex;
  width: 100%;
  gap: 8px;
  align-items: center;
}

.sm-workspace-sidebar-host__search--sandbox .sm-input {
  flex: 1;
  min-width: 0;
}

.sm-workspace-sidebar-host__body {
  flex: 1;
  min-height: 0;
}

.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-enter-active,
.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-leave-active {
  transition: none;
}

.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-enter-from,
.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-leave-to,
.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-enter-to,
.sm-workspace-sidebar-host__body.sm-sidebar-body-switch-leave-from {
  opacity: 1;
  transform: translateX(0);
}

.sm-workspace-sidebar-host__refresh-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 8px;
  color: var(--sm-color-text-secondary);
  flex-shrink: 0;
}

.sm-workspace-sidebar-host__refresh-button:hover:not(:disabled) {
  background-color: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
  color: var(--sm-color-text-primary);
}

.sm-workspace-sidebar-host__kb-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.sm-workspace-sidebar-host__kb-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.sm-workspace-sidebar-host__kb-item:hover {
  background-color: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.sm-workspace-sidebar-host__kb-item.is-active {
  background-color: rgba(142, 149, 217, 0.12);
  border-color: var(--sm-color-border-accent);
}

.sm-workspace-sidebar-host__kb-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--sm-color-surface-2);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sm-workspace-sidebar-host__kb-info {
  flex: 1;
  min-width: 0;
}

.sm-workspace-sidebar-host__kb-name {
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sm-workspace-sidebar-host__kb-meta {
  font-size: 11px;
  color: var(--sm-color-text-secondary);
}

.sm-workspace-sidebar-host__kb-delete {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  opacity: 0;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sm-workspace-sidebar-host__kb-item:hover .sm-workspace-sidebar-host__kb-delete {
  opacity: 1;
}

.sm-workspace-sidebar-host__kb-delete:hover {
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: rgba(199, 120, 120, 0.92);
}

.sm-workspace-sidebar-host__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.sm-workspace-sidebar-host__empty-text {
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}
</style>
