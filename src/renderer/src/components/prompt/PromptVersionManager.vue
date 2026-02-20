<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { PromptVersion, PromptVersionDiff } from '@renderer/types'

// ==================== Props & Emits ====================
const emit = defineEmits<{
  (e: 'error', message: string): void
  (e: 'success', message: string): void
}>()

// ==================== State ====================
const versions = ref<PromptVersion[]>([])
const loading = ref(false)
const selectedVersion = ref<PromptVersion | null>(null)
const diffResult = ref<PromptVersionDiff | null>(null)
const showDetailModal = ref(false)
const showDiffModal = ref(false)
const showRollbackConfirm = ref(false)
const versionToRollback = ref<string>('')

// 新标签输入
const newTagInput = ref('')
const editingTagVersion = ref<string>('')

// ==================== Lifecycle ====================
onMounted(() => {
  loadVersions()
})

// ==================== Methods ====================
async function loadVersions(): Promise<void> {
  loading.value = true
  try {
    versions.value = await window.api.promptVersion.getVersions()
  } catch (error) {
    emit('error', '加载版本列表失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function viewVersionDetail(version: PromptVersion): void {
  selectedVersion.value = version
  showDetailModal.value = true
}

async function viewVersionDiff(version: PromptVersion): Promise<void> {
  if (!version) return

  // 查找上一个版本进行对比
  const currentIndex = versions.value.findIndex((v) => v.id === version.id)
  const previousVersion = versions.value[currentIndex + 1]

  if (!previousVersion) {
    emit('error', '没有上一个版本可以对比')
    return
  }

  try {
    diffResult.value = await window.api.promptVersion.compareVersions(
      previousVersion.id,
      version.id
    )
    showDiffModal.value = true
  } catch (error) {
    emit('error', '对比版本失败')
    console.error(error)
  }
}

function confirmRollback(versionId: string): void {
  versionToRollback.value = versionId
  showRollbackConfirm.value = true
}

async function executeRollback(): Promise<void> {
  try {
    const result = await window.api.promptVersion.rollbackToVersion(versionToRollback.value)
    if (result.success) {
      emit('success', '回滚成功')
      await loadVersions()
    } else {
      emit('error', result.error || '回滚失败')
    }
  } catch (error) {
    emit('error', '回滚失败')
    console.error(error)
  } finally {
    showRollbackConfirm.value = false
    versionToRollback.value = ''
  }
}

function startEditTag(version: PromptVersion): void {
  editingTagVersion.value = version.id
  newTagInput.value = version.tag || ''
}

async function saveTag(versionId: string): Promise<void> {
  try {
    const result = await window.api.promptVersion.setVersionTag(versionId, newTagInput.value)
    if (result.success) {
      emit('success', '标签设置成功')
      editingTagVersion.value = ''
      await loadVersions()
    } else {
      emit('error', result.error || '设置标签失败')
    }
  } catch (error) {
    emit('error', '设置标签失败')
    console.error(error)
  }
}

function cancelEditTag(): void {
  editingTagVersion.value = ''
  newTagInput.value = ''
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getVersionClass(version: PromptVersion): string {
  if (version.isActive) return 'active'
  return ''
}
</script>

<template>
  <div class="version-manager">
    <!-- 头部 -->
    <div class="manager-header">
      <h3 class="manager-title">提示词版本管理</h3>
      <button class="btn btn-sm" :disabled="loading" @click="loadVersions">
        <span v-if="loading">刷新中...</span>
        <span v-else>刷新</span>
      </button>
    </div>

    <!-- 版本列表 -->
    <div class="versions-list">
      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="versions.length === 0" class="empty-state">暂无版本记录</div>
      <div
        v-for="version in versions"
        :key="version.id"
        class="version-item"
        :class="getVersionClass(version)"
      >
        <div class="version-info">
          <div class="version-header">
            <span class="version-number">{{ version.version }}</span>
            <span v-if="version.isActive" class="active-badge">当前</span>
            <span v-if="version.tag" class="version-tag">{{ version.tag }}</span>
          </div>
          <div class="version-summary">{{ version.summary }}</div>
          <div class="version-meta">
            <span class="version-time">{{ formatDate(version.createdAt) }}</span>
            <span v-if="version.createdBy" class="version-author">by {{ version.createdBy }}</span>
          </div>
        </div>

        <div class="version-actions">
          <!-- 标签编辑 -->
          <div v-if="editingTagVersion === version.id" class="tag-edit">
            <input
              v-model="newTagInput"
              type="text"
              class="input input-sm"
              placeholder="输入标签..."
              @keyup.enter="saveTag(version.id)"
            />
            <button class="btn btn-sm btn-success" @click="saveTag(version.id)">保存</button>
            <button class="btn btn-sm" @click="cancelEditTag">取消</button>
          </div>
          <template v-else>
            <button class="btn btn-sm" title="设置标签" @click="startEditTag(version)">标签</button>
            <button class="btn btn-sm" title="查看详情" @click="viewVersionDetail(version)">
              详情
            </button>
            <button class="btn btn-sm" title="对比" @click="viewVersionDiff(version)">对比</button>
            <button
              v-if="!version.isActive"
              class="btn btn-sm btn-warning"
              title="回滚到此版本"
              @click="confirmRollback(version.id)"
            >
              回滚
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <div v-if="showDetailModal" class="modal-overlay" @click="showDetailModal = false">
      <div class="modal-container modal-lg" @click.stop>
        <div class="modal-header">
          <h4>版本详情 - {{ selectedVersion?.version }}</h4>
          <button class="close-btn" @click="showDetailModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="detail-section">
            <label>版本号:</label>
            <span>{{ selectedVersion?.version }}</span>
          </div>
          <div class="detail-section">
            <label>标签:</label>
            <span>{{ selectedVersion?.tag || '无' }}</span>
          </div>
          <div class="detail-section">
            <label>变更摘要:</label>
            <p>{{ selectedVersion?.summary }}</p>
          </div>
          <div class="detail-section">
            <label>创建时间:</label>
            <span>{{
              selectedVersion?.createdAt ? formatDate(selectedVersion.createdAt) : ''
            }}</span>
          </div>
          <div class="detail-section">
            <label>提示词内容:</label>
            <pre class="prompt-content">{{ selectedVersion?.content }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- 对比弹窗 -->
    <div v-if="showDiffModal" class="modal-overlay" @click="showDiffModal = false">
      <div class="modal-container modal-xl" @click.stop>
        <div class="modal-header">
          <h4>
            版本对比: {{ diffResult?.oldVersion.version }} → {{ diffResult?.newVersion.version }}
          </h4>
          <button class="close-btn" @click="showDiffModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="diff-view">
            <div
              v-for="(line, index) in diffResult?.diff"
              :key="index"
              class="diff-line"
              :class="line.type"
            >
              <span class="line-number">
                {{ line.lineNumber.old || ''
                }}{{ line.lineNumber.old && line.lineNumber.new ? '/' : ''
                }}{{ line.lineNumber.new || '' }}
              </span>
              <span class="line-marker">{{
                line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '
              }}</span>
              <span class="line-content">{{ line.line }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 回滚确认弹窗 -->
    <div v-if="showRollbackConfirm" class="modal-overlay" @click="showRollbackConfirm = false">
      <div class="modal-container modal-sm" @click.stop>
        <div class="modal-header">
          <h4>确认回滚</h4>
        </div>
        <div class="modal-body">
          <p>确定要回滚到选中的版本吗？这将替换当前的提示词配置。</p>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="showRollbackConfirm = false">取消</button>
          <button class="btn btn-warning" @click="executeRollback">确认回滚</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.version-manager {
  padding: 16px;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.manager-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.versions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--theme-text-secondary);
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  transition: all 0.2s ease;
}

.version-item:hover {
  border-color: var(--theme-accent);
}

.version-item.active {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.version-info {
  flex: 1;
  min-width: 0;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.version-number {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  font-family: var(--theme-font);
}

.active-badge {
  padding: 2px 8px;
  background-color: var(--theme-accent);
  color: var(--theme-bg);
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
}

.version-tag {
  padding: 2px 8px;
  background-color: var(--theme-bg-hover);
  color: var(--theme-accent-secondary);
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--theme-border);
}

.version-summary {
  font-size: 13px;
  color: var(--theme-text);
  margin-bottom: 8px;
  line-height: 1.5;
}

.version-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.version-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.tag-edit {
  display: flex;
  gap: 8px;
  align-items: center;
}

.tag-edit input {
  width: 120px;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-container {
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-lg {
  width: 100%;
  max-width: 700px;
}

.modal-xl {
  width: 100%;
  max-width: 900px;
}

.modal-sm {
  width: 100%;
  max-width: 400px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
}

.modal-header h4 {
  margin: 0;
  font-size: 15px;
  color: var(--theme-text);
}

.close-btn {
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: var(--theme-text);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
}

/* 详情样式 */
.detail-section {
  margin-bottom: 16px;
}

.detail-section label {
  display: block;
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-bottom: 4px;
}

.detail-section span,
.detail-section p {
  font-size: 13px;
  color: var(--theme-text);
}

.prompt-content {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  padding: 12px;
  font-family: var(--theme-font);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
  color: var(--theme-text);
}

/* 对比视图样式 */
.diff-view {
  font-family: var(--theme-font);
  font-size: 12px;
  line-height: 1.6;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  overflow: auto;
  max-height: 600px;
}

.diff-line {
  display: flex;
  padding: 2px 8px;
  white-space: pre-wrap;
}

.diff-line.added {
  background-color: rgba(63, 185, 80, 0.1);
}

.diff-line.removed {
  background-color: rgba(248, 81, 73, 0.1);
}

.diff-line.unchanged {
  background-color: transparent;
}

.line-number {
  width: 60px;
  color: var(--theme-text-secondary);
  flex-shrink: 0;
  text-align: right;
  padding-right: 8px;
}

.line-marker {
  width: 20px;
  flex-shrink: 0;
  text-align: center;
}

.diff-line.added .line-marker {
  color: var(--theme-success);
}

.diff-line.removed .line-marker {
  color: var(--theme-danger);
}

.line-content {
  flex: 1;
  word-break: break-all;
}

/* 按钮样式 */
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-success {
  background-color: var(--theme-success);
  border-color: var(--theme-success);
  color: white;
}

.btn-warning {
  background-color: var(--theme-warning);
  border-color: var(--theme-warning);
  color: var(--theme-bg);
}

.input-sm {
  padding: 4px 8px;
  font-size: 12px;
}
</style>
