<script setup lang="ts">
import { computed, ref } from 'vue'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import { FileIcon } from './shared'
import FilePreviewDialog from './FilePreviewDialog.vue'
import { getFileSourceClass, getFileSourceLabel } from './utils/fileSource'
import styles from './FileListPanel.module.css'

const props = defineProps<{
  linkedFiles: FileItem[]
  loadingFiles: boolean
  isDragging: boolean
  unlinkingFileId: string | null
  indexingStatus: boolean
  reindexing: boolean
  kbIndexingFiles: Record<string, { progress?: number }>
  invalidatedFileIds?: string[]
}>()

const emit = defineEmits<{
  (e: 'dragenter', event: DragEvent): void
  (e: 'dragleave', event: DragEvent): void
  (e: 'dragover', event: DragEvent): void
  (e: 'drop', event: DragEvent): void
  (e: 'add-files'): void
  (e: 'reindex'): void
  (e: 'unlink-file', fileId: string): void
}>()

const fileStore = useFileStore()

// 文件预览
const previewFile = ref<FileItem | null>(null)
const showPreview = ref(false)
const hasInvalidatedFiles = computed(() => (props.invalidatedFileIds?.length ?? 0) > 0)

function handlePreviewFile(file: FileItem): void {
  previewFile.value = file
  showPreview.value = true
}

function handleClosePreview(): void {
  showPreview.value = false
  setTimeout(() => {
    previewFile.value = null
  }, 300)
}

function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return fileName.substring(0, lastDotIndex)
  }
  return fileName
}

function isInvalidatedFile(file: FileItem): boolean {
  return props.invalidatedFileIds?.includes(file.id) === true
}
</script>

<template>
  <section
    :class="[styles['documents-section'], { [styles['drag-over']]: isDragging }]"
    @dragenter="emit('dragenter', $event)"
    @dragleave="emit('dragleave', $event)"
    @dragover="emit('dragover', $event)"
    @drop="emit('drop', $event)"
  >
    <div :class="styles['section-header']">
      <div>
        <h3>关联文档</h3>
      </div>
      <div :class="styles['section-header__actions']">
        <span :class="styles['document-count']">{{ linkedFiles.length }} 个文件</span>
        <button
          :class="[
            'sm-button',
            'sm-button--secondary',
            styles['reindex-btn'],
            { [styles['reindex-btn--warning']]: hasInvalidatedFiles }
          ]"
          :disabled="indexingStatus || reindexing || linkedFiles.length === 0"
          @click="emit('reindex')"
        >
          <span v-if="reindexing" class="sm-spinner"></span>
          {{ reindexing ? '索引中...' : '重新索引' }}
        </button>
        <button
          :class="['sm-button', 'sm-button--primary', styles['add-files-btn']]"
          @click="emit('add-files')"
        >
          添加文档
        </button>
      </div>
    </div>

    <div v-if="isDragging" :class="styles['drag-overlay']">
      <div :class="styles['drag-content']">
        <span :class="styles['drag-icon']">+</span>
        <div :class="styles['drag-copy']">
          <strong>释放文件以上传并挂载</strong>
          <span>支持 TXT、Markdown、PDF、Word 和 CSV。</span>
        </div>
      </div>
    </div>

    <div v-if="loadingFiles" :class="styles['loading-state']">
      <span class="sm-spinner sm-spinner--large"></span>
      <span>正在加载文档...</span>
    </div>

    <div v-else-if="linkedFiles.length === 0" :class="['sm-empty', styles['documents-empty']]">
      <h4>当前知识库还没有挂载文档</h4>
      <p>从文件资源池中选择已有文档，或直接拖拽文件到这里上传。</p>
      <button class="sm-button sm-button--primary" @click="emit('add-files')">
        添加第一份文档
      </button>
    </div>

    <div v-else :class="styles['documents-grid']">
      <article
        v-for="file in linkedFiles"
        :key="file.id"
        :class="[
          styles['document-card'],
          {
            [styles.unlinking]: unlinkingFileId === file.id,
            [styles['indexing-disabled']]: indexingStatus,
            [styles['needs-reindex']]: isInvalidatedFile(file)
          }
        ]"
        @click="handlePreviewFile(file)"
      >
        <div :class="styles['document-card__header']">
          <FileIcon :file-type="file.fileType" :size="20" />
          <button
            :class="styles['document-remove-btn']"
            :disabled="unlinkingFileId === file.id || indexingStatus"
            title="取消关联"
            @click.stop="emit('unlink-file', file.id)"
          >
            <span v-if="unlinkingFileId === file.id" class="sm-spinner"></span>
            <SvgIcon v-else name="trash" :size="12" />
          </button>
        </div>

        <div :class="styles['document-info']">
          <div :class="styles['document-name']" :title="file.name">
            {{ getFileNameWithoutExtension(file.name) }}
          </div>

          <div v-if="kbIndexingFiles[file.id]" :class="styles['file-progress']">
            <div :class="styles['file-progress__meta']">
              <span>索引同步中</span>
              <span>{{ kbIndexingFiles[file.id].progress || 0 }}%</span>
            </div>
            <div :class="styles['progress-bar']">
              <div
                :class="styles['progress-fill']"
                :style="{ width: `${kbIndexingFiles[file.id].progress || 0}%` }"
              ></div>
            </div>
          </div>
        </div>

        <div :class="styles['document-meta']">
          <span :class="[styles['source-badge'], styles[getFileSourceClass(file)]]">
            {{ getFileSourceLabel(file) }}
          </span>
          <span :class="['badge', styles['document-type']]">{{ file.fileType.toUpperCase() }}</span>
          <span>{{ fileStore.formatFileSize(file.size) }}</span>
          <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
        </div>
      </article>

      <button :class="styles['add-file-card']" @click="emit('add-files')">
        <span :class="styles['add-file-icon']" aria-hidden="true"></span>
        <span :class="styles['add-file-text']">添加更多文档或拖拽上传</span>
      </button>
    </div>

    <FilePreviewDialog :visible="showPreview" :file="previewFile" @close="handleClosePreview" />
  </section>
</template>
