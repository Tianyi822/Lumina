<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { FewShotExample } from '@renderer/types'

// ==================== Props & Emits ====================
const emit = defineEmits<{
  (e: 'error', message: string): void
  (e: 'success', message: string): void
}>()

// ==================== State ====================
const examples = ref<FewShotExample[]>([])
const loading = ref(false)
const selectedCategory = ref<string>('all')
const searchQuery = ref('')

// 编辑弹窗状态
const showEditModal = ref(false)
const editingExample = ref<Partial<FewShotExample>>({})
const isCreating = ref(false)

// 导入弹窗状态
const showImportModal = ref(false)
const importData = ref('')

// ==================== Computed ====================
const categories = computed(() => {
  const cats = new Set(examples.value.map((e) => e.category))
  return ['all', ...Array.from(cats)]
})

const filteredExamples = computed(() => {
  let result = examples.value

  // 分类筛选
  if (selectedCategory.value !== 'all') {
    result = result.filter((e) => e.category === selectedCategory.value)
  }

  // 搜索筛选
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        e.description.toLowerCase().includes(query) ||
        e.userInput.toLowerCase().includes(query)
    )
  }

  return result
})

const enabledCount = computed(() => examples.value.filter((e) => e.enabled).length)

// ==================== Lifecycle ====================
onMounted(() => {
  loadExamples()
})

// ==================== Methods ====================
async function loadExamples(): Promise<void> {
  loading.value = true
  try {
    examples.value = await window.api.example.getExamples()
  } catch (error) {
    emit('error', '加载示例失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

function createExample(): void {
  isCreating.value = true
  editingExample.value = {
    name: '',
    description: '',
    category: 'general',
    userInput: '',
    reasoning: '',
    assistantResponse: '',
    qualityScore: 80,
    enabled: true,
    source: 'static'
  }
  showEditModal.value = true
}

function editExample(example: FewShotExample): void {
  isCreating.value = false
  editingExample.value = { ...example }
  showEditModal.value = true
}

async function saveExample(): Promise<void> {
  try {
    if (isCreating.value) {
      const result = await window.api.example.createExample(
        editingExample.value as Omit<FewShotExample, 'id' | 'createdAt'>
      )
      if (result.success) {
        emit('success', '示例创建成功')
        showEditModal.value = false
        await loadExamples()
      } else {
        emit('error', result.error || '创建失败')
      }
    } else if (editingExample.value.id) {
      const result = await window.api.example.updateExample(
        editingExample.value.id,
        editingExample.value
      )
      if (result.success) {
        emit('success', '示例更新成功')
        showEditModal.value = false
        await loadExamples()
      } else {
        emit('error', result.error || '更新失败')
      }
    }
  } catch (error) {
    emit('error', '保存失败')
    console.error(error)
  }
}

async function toggleExample(example: FewShotExample): Promise<void> {
  try {
    const result = await window.api.example.toggleExample(example.id, !example.enabled)
    if (result.success) {
      example.enabled = !example.enabled
      emit('success', example.enabled ? '已启用' : '已禁用')
    } else {
      emit('error', result.error || '操作失败')
    }
  } catch (error) {
    emit('error', '操作失败')
    console.error(error)
  }
}

async function deleteExample(example: FewShotExample): Promise<void> {
  if (!confirm(`确定要删除示例 "${example.name}" 吗？`)) return

  try {
    const result = await window.api.example.deleteExample(example.id)
    if (result.success) {
      emit('success', '删除成功')
      await loadExamples()
    } else {
      emit('error', result.error || '删除失败')
    }
  } catch (error) {
    emit('error', '删除失败')
    console.error(error)
  }
}

async function exportExamples(): Promise<void> {
  try {
    const result = await window.api.example.exportExamples()
    if (result.success && result.data) {
      const blob = new Blob([result.data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `few-shot-examples-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      emit('success', '导出成功')
    } else {
      emit('error', result.error || '导出失败')
    }
  } catch (error) {
    emit('error', '导出失败')
    console.error(error)
  }
}

function showImportDialog(): void {
  importData.value = ''
  showImportModal.value = true
}

async function importExamples(): Promise<void> {
  try {
    const result = await window.api.example.importExamples(importData.value)
    if (result.success) {
      emit('success', `成功导入 ${result.count} 个示例`)
      showImportModal.value = false
      await loadExamples()
    } else {
      emit('error', result.error || '导入失败')
    }
  } catch (error) {
    emit('error', '导入失败')
    console.error(error)
  }
}

function getQualityScoreClass(score: number): string {
  if (score >= 90) return 'quality-excellent'
  if (score >= 70) return 'quality-good'
  if (score >= 50) return 'quality-medium'
  return 'quality-poor'
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    static: '静态',
    dynamic: '动态'
  }
  return labels[source] || source
}
</script>

<template>
  <div class="example-manager">
    <!-- 头部 -->
    <div class="manager-header">
      <h3 class="manager-title">
        Few-shot 示例管理
        <span class="subtitle">({{ enabledCount }}/{{ examples.length }} 已启用)</span>
      </h3>
      <div class="header-actions">
        <button class="btn btn-sm" @click="exportExamples">导出</button>
        <button class="btn btn-sm" @click="showImportDialog">导入</button>
        <button class="btn btn-sm btn-primary" @click="createExample">新建示例</button>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <select v-model="selectedCategory" class="input input-sm">
        <option value="all">全部分类</option>
        <option v-for="cat in categories.filter((c) => c !== 'all')" :key="cat" :value="cat">
          {{ cat }}
        </option>
      </select>
      <input
        v-model="searchQuery"
        type="text"
        class="input input-sm"
        placeholder="搜索示例..."
      />
    </div>

    <!-- 示例列表 -->
    <div class="examples-list">
      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="filteredExamples.length === 0" class="empty-state">
        {{ searchQuery ? '没有找到匹配的示例' : '暂无示例' }}
      </div>
      <div
        v-for="example in filteredExamples"
        :key="example.id"
        class="example-item"
        :class="{ disabled: !example.enabled }"
      >
        <div class="example-header">
          <div class="example-info">
            <span class="example-name">{{ example.name }}</span>
            <span class="example-category">{{ example.category }}</span>
            <span class="example-source">{{ getSourceLabel(example.source) }}</span>
            <span class="quality-badge" :class="getQualityScoreClass(example.qualityScore)">
              {{ example.qualityScore }}分
            </span>
          </div>
          <div class="example-actions">
            <button
              class="btn btn-sm"
              :class="example.enabled ? 'btn-warning' : 'btn-success'"
              @click="toggleExample(example)"
            >
              {{ example.enabled ? '禁用' : '启用' }}
            </button>
            <button class="btn btn-sm" @click="editExample(example)">编辑</button>
            <button class="btn btn-sm btn-danger" @click="deleteExample(example)">删除</button>
          </div>
        </div>
        <div class="example-description">{{ example.description }}</div>
        <div class="example-preview">
          <div class="preview-line">
            <span class="preview-label">用户:</span>
            <span class="preview-content">{{ example.userInput.slice(0, 100) }}...</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEditModal" class="modal-overlay" @click="showEditModal = false">
      <div class="modal-container modal-lg" @click.stop>
        <div class="modal-header">
          <h4>{{ isCreating ? '新建示例' : '编辑示例' }}</h4>
          <button class="close-btn" @click="showEditModal = false">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称</label>
            <input v-model="editingExample.name" type="text" class="input" />
          </div>
          <div class="form-group">
            <label>分类</label>
            <input v-model="editingExample.category" type="text" class="input" />
          </div>
          <div class="form-group">
            <label>描述</label>
            <input v-model="editingExample.description" type="text" class="input" />
          </div>
          <div class="form-group">
            <label>用户输入</label>
            <textarea v-model="editingExample.userInput" class="textarea" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>思考过程</label>
            <textarea v-model="editingExample.reasoning" class="textarea" rows="4"></textarea>
          </div>
          <div class="form-group">
            <label>助手响应</label>
            <textarea v-model="editingExample.assistantResponse" class="textarea" rows="4"></textarea>
          </div>
          <div class="form-group">
            <label>质量评分 (0-100)</label>
            <input
              v-model.number="editingExample.qualityScore"
              type="number"
              min="0"
              max="100"
              class="input"
            />
          </div>
          <div class="form-group">
            <label>
              <input v-model="editingExample.enabled" type="checkbox" />
              <span>启用此示例</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="showEditModal = false">取消</button>
          <button class="btn btn-primary" @click="saveExample">保存</button>
        </div>
      </div>
    </div>

    <!-- 导入弹窗 -->
    <div v-if="showImportModal" class="modal-overlay" @click="showImportModal = false">
      <div class="modal-container" @click.stop>
        <div class="modal-header">
          <h4>导入示例</h4>
          <button class="close-btn" @click="showImportModal = false">×</button>
        </div>
        <div class="modal-body">
          <p class="help-text">粘贴 JSON 格式的示例数据：</p>
          <textarea v-model="importData" class="textarea" rows="10" placeholder="[
  {
    &quot;name&quot;: &quot;示例名称&quot;,
    &quot;category&quot;: &quot;分类&quot;,
    ...
  }
]"></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="showImportModal = false">取消</button>
          <button class="btn btn-primary" @click="importExamples">导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.example-manager {
  padding: 16px;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.manager-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.subtitle {
  font-size: 13px;
  font-weight: normal;
  color: var(--theme-text-secondary);
  margin-left: 8px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-bar select {
  width: 150px;
}

.filter-bar input {
  flex: 1;
}

.examples-list {
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

.example-item {
  padding: 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  transition: all 0.2s ease;
}

.example-item:hover {
  border-color: var(--theme-accent);
}

.example-item.disabled {
  opacity: 0.6;
}

.example-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.example-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.example-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
}

.example-category {
  padding: 2px 8px;
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
  font-size: 11px;
  border-radius: 4px;
}

.example-source {
  padding: 2px 8px;
  background-color: var(--theme-accent-secondary);
  color: var(--theme-bg);
  font-size: 11px;
  border-radius: 4px;
}

.quality-badge {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  font-weight: 600;
}

.quality-excellent {
  background-color: rgba(63, 185, 80, 0.2);
  color: var(--theme-success);
}

.quality-good {
  background-color: rgba(88, 166, 255, 0.2);
  color: var(--theme-accent-secondary);
}

.quality-medium {
  background-color: rgba(210, 153, 34, 0.2);
  color: var(--theme-warning);
}

.quality-poor {
  background-color: rgba(248, 81, 73, 0.2);
  color: var(--theme-danger);
}

.example-actions {
  display: flex;
  gap: 8px;
}

.example-description {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

.example-preview {
  padding: 8px 12px;
  background-color: var(--theme-bg);
  border-radius: 6px;
  font-size: 12px;
}

.preview-line {
  display: flex;
  gap: 8px;
}

.preview-label {
  color: var(--theme-accent);
  font-weight: 600;
  flex-shrink: 0;
}

.preview-content {
  color: var(--theme-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-lg {
  max-width: 700px;
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

.form-group label input[type='checkbox'] {
  margin-right: 8px;
}

.textarea {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  background-color: var(--theme-bg);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  color: var(--theme-text);
  font-family: var(--theme-font);
  font-size: 13px;
  resize: vertical;
}

.textarea:focus {
  border-color: var(--theme-accent);
  outline: none;
}

.help-text {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin-bottom: 12px;
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
