<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ABTestConfig, ABTestResult, PromptVersion } from '@renderer/types'

// ==================== Props & Emits ====================
const emit = defineEmits<{
  (e: 'error', message: string): void
  (e: 'success', message: string): void
}>()

// ==================== State ====================
const tests = ref<ABTestConfig[]>([])
const versions = ref<PromptVersion[]>([])
const loading = ref(false)

// 创建/编辑弹窗状态
const showEditModal = ref(false)
const editingTest = ref<Partial<ABTestConfig>>({})
const isCreating = ref(false)

// 结果弹窗状态
const showResultModal = ref(false)
const selectedTestResult = ref<ABTestResult | null>(null)

// ==================== Computed ====================
const statusLabels: Record<string, string> = {
  draft: '草稿',
  running: '进行中',
  paused: '已暂停',
  completed: '已完成'
}

const statusClasses: Record<string, string> = {
  draft: 'status-draft',
  running: 'status-running',
  paused: 'status-paused',
  completed: 'status-completed'
}

// ==================== Lifecycle ====================
onMounted(() => {
  loadData()
})

// ==================== Methods ====================
async function loadData(): Promise<void> {
  loading.value = true
  try {
    const [testsData, versionsData] = await Promise.all([
      window.api.abTest.getTests(),
      window.api.promptVersion.getVersions()
    ])
    tests.value = testsData
    versions.value = versionsData
  } catch (error) {
    emit('error', '加载数据失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function createTest(): void {
  isCreating.value = true
  editingTest.value = {
    name: '',
    description: '',
    status: 'draft',
    versionA: '',
    versionB: '',
    trafficSplit: 0.5,
    metrics: ['success_rate', 'token_efficiency']
  }
  showEditModal.value = true
}

function editTest(test: ABTestConfig): void {
  isCreating.value = false
  editingTest.value = { ...test }
  showEditModal.value = true
}

async function saveTest(): Promise<void> {
  try {
    if (isCreating.value) {
      const result = await window.api.abTest.createTest(
        editingTest.value as Omit<ABTestConfig, 'id' | 'createdAt'>
      )
      if (result.success) {
        emit('success', '测试创建成功')
        showEditModal.value = false
        await loadData()
      } else {
        emit('error', result.error || '创建失败')
      }
    } else if (editingTest.value.id) {
      const result = await window.api.abTest.updateTest(
        editingTest.value.id,
        editingTest.value
      )
      if (result.success) {
        emit('success', '测试更新成功')
        showEditModal.value = false
        await loadData()
      } else {
        emit('error', result.error || '更新失败')
      }
    }
  } catch (error) {
    emit('error', '保存失败')
    console.error(error)
  }
}

async function startTest(testId: string): Promise<void> {
  try {
    const result = await window.api.abTest.startTest(testId)
    if (result.success) {
      emit('success', '测试已开始')
      await loadData()
    } else {
      emit('error', result.error || '启动失败')
    }
  } catch (error) {
    emit('error', '启动测试失败')
    console.error(error)
  }
}

async function pauseTest(testId: string): Promise<void> {
  try {
    const result = await window.api.abTest.pauseTest(testId)
    if (result.success) {
      emit('success', '测试已暂停')
      await loadData()
    } else {
      emit('error', result.error || '暂停失败')
    }
  } catch (error) {
    emit('error', '暂停测试失败')
    console.error(error)
  }
}

async function completeTest(testId: string): Promise<void> {
  if (!confirm('确定要结束此测试吗？结束后将生成最终报告。')) return

  try {
    const result = await window.api.abTest.completeTest(testId)
    if (result.success) {
      emit('success', '测试已结束')
      if (result.result) {
        selectedTestResult.value = result.result
        showResultModal.value = true
      }
      await loadData()
    } else {
      emit('error', result.error || '结束失败')
    }
  } catch (error) {
    emit('error', '结束测试失败')
    console.error(error)
  }
}

async function viewResult(testId: string): Promise<void> {
  try {
    const result = await window.api.abTest.getTestResult(testId)
    if (result) {
      selectedTestResult.value = result
      showResultModal.value = true
    } else {
      emit('error', '暂无测试结果')
    }
  } catch (error) {
    emit('error', '获取结果失败')
    console.error(error)
  }
}

async function deleteTest(test: ABTestConfig): Promise<void> {
  if (!confirm(`确定要删除测试 "${test.name}" 吗？`)) return

  try {
    const result = await window.api.abTest.deleteTest(test.id)
    if (result.success) {
      emit('success', '删除成功')
      await loadData()
    } else {
      emit('error', result.error || '删除失败')
    }
  } catch (error) {
    emit('error', '删除失败')
    console.error(error)
  }
}

function formatTrafficSplit(split: number): string {
  return `${(split * 100).toFixed(0)}%`
}

/*
// 预留：格式化日期
function formatDate(dateString?: string): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString('zh-CN')
}
*/
</script>

<template>
  <div class="abtest-manager">
    <!-- 头部 -->
    <div class="manager-header">
      <h3 class="manager-title">A/B 测试管理</h3>
      <button class="btn btn-sm btn-primary" @click="createTest">新建测试</button>
    </div>

    <!-- 测试列表 -->
    <div class="tests-list">
      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="tests.length === 0" class="empty-state">暂无测试</div>
      <div v-for="test in tests" :key="test.id" class="test-item">
        <div class="test-header">
          <div class="test-info">
            <span class="test-name">{{ test.name }}</span>
            <span class="test-status" :class="statusClasses[test.status]">
              {{ statusLabels[test.status] }}
            </span>
          </div>
          <div class="test-actions">
            <template v-if="test.status === 'draft'">
              <button class="btn btn-sm btn-success" @click="startTest(test.id)">开始</button>
            </template>
            <template v-else-if="test.status === 'running'">
              <button class="btn btn-sm btn-warning" @click="pauseTest(test.id)">暂停</button>
              <button class="btn btn-sm" @click="completeTest(test.id)">结束</button>
            </template>
            <template v-else-if="test.status === 'paused'">
              <button class="btn btn-sm btn-success" @click="startTest(test.id)">继续</button>
              <button class="btn btn-sm" @click="completeTest(test.id)">结束</button>
            </template>
            <button v-if="test.status === 'completed'" class="btn btn-sm" @click="viewResult(test.id)">
              查看结果
            </button>
            <button v-if="test.status === 'draft'" class="btn btn-sm" @click="editTest(test)">编辑</button>
            <button v-if="test.status !== 'running'" class="btn btn-sm btn-danger" @click="deleteTest(test)">
              删除
            </button>
          </div>
        </div>
        <div class="test-description">{{ test.description || '无描述' }}</div>
        <div class="test-config">
          <div class="config-item">
            <span class="config-label">版本 A:</span>
            <span class="config-value">{{ test.versionA }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">版本 B:</span>
            <span class="config-value">{{ test.versionB }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">流量分配:</span>
            <span class="config-value">A {{ formatTrafficSplit(1 - test.trafficSplit) }} / B {{ formatTrafficSplit(test.trafficSplit) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEditModal" class="modal-overlay" @click="showEditModal = false">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <h4>{{ isCreating ? '新建测试' : '编辑测试' }}</h4>
          <button class="close-btn" @click="showEditModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>测试名称</label>
            <input v-model="editingTest.name" type="text" class="input" />
          </div>
          <div class="form-group">
            <label>描述</label>
            <textarea v-model="editingTest.description" class="textarea" rows="2"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>版本 A (对照组)</label>
              <select v-model="editingTest.versionA" class="input">
                <option v-for="v in versions" :key="v.id" :value="v.version">{{ v.version }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>版本 B (实验组)</label>
              <select v-model="editingTest.versionB" class="input">
                <option v-for="v in versions" :key="v.id" :value="v.version">{{ v.version }}</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>B 组流量比例: {{ formatTrafficSplit(editingTest.trafficSplit || 0.5) }}</label>
            <input
              v-model.number="editingTest.trafficSplit"
              type="range"
              min="0.1"
              max="0.9"
              step="0.1"
              class="slider"
            />
          </div>
          <div class="form-group">
            <label>测试指标</label>
            <div class="checkbox-group">
              <label><input v-model="editingTest.metrics" type="checkbox" value="success_rate" /> 成功率</label>
              <label><input v-model="editingTest.metrics" type="checkbox" value="token_efficiency" /> Token 效率</label>
              <label><input v-model="editingTest.metrics" type="checkbox" value="response_time" /> 响应时间</label>
              <label><input v-model="editingTest.metrics" type="checkbox" value="satisfaction" /> 满意度</label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="showEditModal = false">取消</button>
          <button class="btn btn-primary" @click="saveTest">保存</button>
        </div>
      </div>
    </div>

    <!-- 结果弹窗 -->
    <div v-if="showResultModal" class="modal-overlay" @click="showResultModal = false">
      <div class="modal-container modal-lg" @click.stop>
        <div class="modal-header">
          <h4>A/B 测试结果</h4>
          <button class="close-btn" @click="showResultModal = false">×</button>
        </div>
        <div class="modal-body">
          <div v-if="selectedTestResult" class="result-content">
            <div class="result-summary">
              <div class="winner-badge" :class="selectedTestResult.winner">
                {{ selectedTestResult.winner === 'A' ? '版本 A 胜出' : selectedTestResult.winner === 'B' ? '版本 B 胜出' : '平局' }}
              </div>
              <div class="confidence">置信度: {{ (selectedTestResult.confidence * 100).toFixed(1) }}%</div>
            </div>
            <div class="result-comparison">
              <div class="version-result">
                <h5>版本 A</h5>
                <div class="metric">会话数: {{ selectedTestResult.versionA.sessions }}</div>
                <div class="metric">成功率: {{ (selectedTestResult.versionA.metrics.toolCallSuccessRate * 100).toFixed(1) }}%</div>
                <div class="metric">Token 效率: {{ selectedTestResult.versionA.metrics.tokenEfficiency.toFixed(2) }}</div>
              </div>
              <div class="version-result">
                <h5>版本 B</h5>
                <div class="metric">会话数: {{ selectedTestResult.versionB.sessions }}</div>
                <div class="metric">成功率: {{ (selectedTestResult.versionB.metrics.toolCallSuccessRate * 100).toFixed(1) }}%</div>
                <div class="metric">Token 效率: {{ selectedTestResult.versionB.metrics.tokenEfficiency.toFixed(2) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.abtest-manager {
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

.tests-list {
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

.test-item {
  padding: 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
}

.test-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.test-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.test-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

.test-status {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
}

.status-draft {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.status-running {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-success);
}

.status-paused {
  background-color: rgba(210, 153, 34, 0.2);
  color: var(--theme-warning);
}

.status-completed {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-accent-secondary);
}

.test-actions {
  display: flex;
  gap: 8px;
}

.test-description {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin-bottom: 12px;
}

.test-config {
  display: flex;
  gap: 24px;
  font-size: 12px;
}

.config-item {
  display: flex;
  gap: 6px;
}

.config-label {
  color: var(--theme-text-secondary);
}

.config-value {
  color: var(--theme-text);
  font-weight: 500;
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
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-lg {
  max-width: 600px;
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

/* 表单样式 */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  color: var(--theme-text);
  margin-bottom: 6px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.textarea {
  width: 100%;
  padding: 10px 12px;
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text);
  font-family: var(--theme-font);
  font-size: 13px;
  resize: vertical;
}

.slider {
  width: 100%;
  margin: 8px 0;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}

.checkbox-group input[type='checkbox'] {
  margin: 0;
}

/* 结果样式 */
.result-content {
  padding: 16px;
}

.result-summary {
  text-align: center;
  margin-bottom: 24px;
}

.winner-badge {
  display: inline-block;
  padding: 8px 16px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  margin-bottom: 8px;
}

.winner-badge.A {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-accent-secondary);
}

.winner-badge.B {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-success);
}

.winner-badge.tie {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.confidence {
  font-size: 14px;
  color: var(--theme-text-secondary);
}

.result-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.version-result {
  padding: 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
}

.version-result h5 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--theme-text);
}

.metric {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

/* 按钮样式 */
.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-primary {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: var(--theme-bg);
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

.btn-danger {
  background-color: var(--theme-danger);
  border-color: var(--theme-danger);
  color: white;
}
</style>
