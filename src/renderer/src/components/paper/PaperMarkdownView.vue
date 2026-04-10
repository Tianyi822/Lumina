<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import type {
  PaperAnnotation,
  PaperReaderDocument,
  PaperTranslationCache
} from '@shared/types/paper'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { usePaperMarkdownEngine } from './composables/usePaperMarkdownEngine'
import { usePaperAnnotationComposer } from './composables/usePaperAnnotationComposer'

const props = defineProps<{
  content: string
  loading: boolean
  paperId: string
  basePath?: string
  translationVisible: boolean
  translationCache?: PaperTranslationCache | null
  readerDocument?: PaperReaderDocument | null
  annotations?: PaperAnnotation[]
}>()

const paperReaderStore = usePaperReaderStore()

const engine = usePaperMarkdownEngine({
  content: () => props.content,
  basePath: () => props.basePath,
  translationVisible: () => props.translationVisible,
  translationCache: () => props.translationCache,
  readerDocument: () => props.readerDocument,
  annotations: () => props.annotations,
  setTocOutline: paperReaderStore.setPaperTocOutline,
  clearToc: paperReaderStore.clearPaperToc
})

const composer = usePaperAnnotationComposer({
  paperId: () => props.paperId,
  translationCache: () => props.translationCache,
  annotations: () => props.annotations,
  renderedSegments: engine.renderedSegments,
  getSourceSegments: engine.getSourceSegments,
  createAnnotation: paperReaderStore.createAnnotation,
  reanchorAnnotation: paperReaderStore.reanchorAnnotation,
  deleteAnnotation: paperReaderStore.deleteAnnotation
})

watch(
  () => [
    props.content,
    props.basePath,
    props.translationVisible,
    props.translationCache?.updatedAt,
    props.translationCache?.completedSegments,
    props.translationCache?.translationRevisionId,
    props.readerDocument?.sourceRevisionId,
    composer.currentAnnotations.value.length,
    composer.currentAnnotations.value.map((annotation) => annotation.updatedAt).join('|')
  ],
  () => {
    engine.renderContent()
    composer.clearComposer()
    composer.cancelRebindMode()
  },
  { immediate: true }
)

const hasContent = computed(() => !!props.content.trim())

if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', composer.handleDocumentPointerDown)
  document.addEventListener('keydown', composer.handleDocumentKeyDown)
}

onBeforeUnmount(() => {
  paperReaderStore.clearPaperToc()
  if (typeof document !== 'undefined') {
    document.removeEventListener('mousedown', composer.handleDocumentPointerDown)
    document.removeEventListener('keydown', composer.handleDocumentKeyDown)
  }
})
</script>

<template>
  <div class="paper-markdown-view">
    <div class="paper-markdown-view__scroll" @mouseup="composer.updateComposerFromSelection">
      <div v-if="loading" class="paper-markdown-view__loading">
        <p>正在加载内容...</p>
      </div>

      <div v-else-if="engine.parseError.value" class="paper-markdown-view__error">
        <p>{{ engine.parseError.value }}</p>
      </div>

      <div v-else-if="!hasContent" class="paper-markdown-view__empty">
        <p>暂无内容</p>
      </div>

      <article v-else class="paper-markdown-view__content">
        <section
          v-if="composer.translationMissingAnnotations.value.length > 0"
          class="paper-markdown-view__status-panel paper-markdown-view__status-panel--warning"
        >
          <div class="paper-markdown-view__status-title">译文已删除，但相关笔记仍然保留</div>
          <p class="paper-markdown-view__status-text">
            {{ composer.translationMissingAnnotations.value.length }}
            条译文笔记已自动降级到原文语义归属， 重新翻译后可以继续恢复到译文视图。
          </p>
          <div class="paper-markdown-view__status-actions">
            <button
              class="sm-button sm-button--primary"
              type="button"
              @click="paperReaderStore.toggleTranslationVisible()"
            >
              重新翻译
            </button>
            <button
              class="sm-button sm-button--secondary"
              type="button"
              @click="paperReaderStore.hideTranslation()"
            >
              在原文中查看
            </button>
          </div>
        </section>

        <section
          v-if="composer.outdatedAnnotations.value.length > 0"
          class="paper-markdown-view__status-panel paper-markdown-view__status-panel--info"
        >
          <div class="paper-markdown-view__status-title">检测到基于旧版译文创建的笔记</div>
          <p class="paper-markdown-view__status-text">
            当前共有
            {{ composer.outdatedAnnotations.value.length }}
            条笔记依赖旧译文版本。系统会优先保留原文归属，
            你可以直接更新到当前译文，或手动重新绑定到新的选区。
          </p>
        </section>

        <section
          v-if="composer.orphanAnnotations.value.length > 0 || composer.rebindAnnotationId.value"
          class="paper-markdown-view__manager"
        >
          <div class="paper-markdown-view__manager-header">
            <div>
              <div class="paper-markdown-view__manager-title">异常笔记管理</div>
              <p class="paper-markdown-view__manager-text">
                这里集中显示需要人工确认的笔记。点击"手动重新绑定"后，直接在正文里重新选择对应文本即可。
              </p>
            </div>
            <button
              v-if="composer.rebindAnnotationId.value"
              class="sm-button sm-button--secondary"
              type="button"
              @click="composer.handleCancelComposer"
            >
              取消重绑
            </button>
          </div>

          <article
            v-for="annotation in composer.orphanAnnotations.value"
            :key="annotation.id"
            class="paper-markdown-view__manager-card"
            :class="{
              'paper-markdown-view__manager-card--active':
                composer.rebindAnnotationId.value === annotation.id
            }"
          >
            <div class="paper-markdown-view__manager-meta">
              <span class="paper-markdown-view__note-type">
                {{ composer.getAnnotationTypeLabel(annotation) }}
              </span>
              <span class="paper-markdown-view__note-status">
                {{ composer.getAnnotationStatusLabel(annotation) || '待人工处理' }}
              </span>
            </div>
            <div class="paper-markdown-view__manager-comment">{{ annotation.comment }}</div>
            <div class="paper-markdown-view__manager-selection">
              {{ annotation.selectedTextSnapshot }}
            </div>
            <div class="paper-markdown-view__status-actions">
              <button
                class="sm-button sm-button--secondary"
                type="button"
                @click="composer.startRebind(annotation)"
              >
                手动重新绑定
              </button>
              <button
                class="sm-button sm-button--secondary"
                type="button"
                @click="composer.scrollToSegment(annotation.semanticAnchor.segmentStableId)"
              >
                查看当前段落
              </button>
              <button
                class="sm-button sm-button--danger"
                type="button"
                @click="composer.handleDeleteAnnotation(annotation.id)"
              >
                删除笔记
              </button>
            </div>
          </article>
        </section>

        <section
          v-for="segment in engine.renderedSegments.value"
          :id="segment.segmentAnchorId"
          :key="segment.renderId"
          class="paper-markdown-view__segment"
          :class="{ 'paper-markdown-view__segment--meta': segment.isCenteredMeta }"
          :data-paper-segment-stable-id="segment.stableId"
        >
          <div v-if="segment.annotations.length > 0" class="paper-markdown-view__segment-tag">
            {{ segment.annotations.length }} 条笔记
          </div>

          <div
            class="paper-markdown-view__segment-original paper-markdown-view__markdown"
            data-paper-selection-surface="true"
            data-view-kind="original"
            :data-segment-stable-id="segment.stableId"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="segment.originalHtml" />
          </div>

          <div
            v-if="segment.showTranslation"
            class="paper-markdown-view__segment-translation"
            :class="`is-${segment.translationStatus}`"
          >
            <div
              v-if="segment.translationHtml"
              class="paper-markdown-view__segment-translation-body paper-markdown-view__markdown"
              data-paper-selection-surface="true"
              data-view-kind="translation"
              :data-segment-stable-id="segment.stableId"
            >
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-html="segment.translationHtml" />
            </div>

            <div
              v-else-if="segment.translationStatus === 'failed'"
              class="paper-markdown-view__translation-error"
            >
              该段翻译暂时失败，再次点击翻译按钮时会继续补全剩余内容。
            </div>

            <div v-else class="paper-markdown-view__translation-placeholder" aria-hidden="true">
              <span class="paper-markdown-view__translation-placeholder-text">正在翻译...</span>
              <span class="paper-markdown-view__translation-placeholder-bar" />
              <span class="paper-markdown-view__translation-placeholder-bar" />
              <span class="paper-markdown-view__translation-placeholder-bar" />
            </div>
          </div>

          <div v-if="segment.annotations.length > 0" class="paper-markdown-view__notes">
            <article
              v-for="annotation in segment.annotations"
              :key="annotation.id"
              class="paper-markdown-view__note"
            >
              <div class="paper-markdown-view__note-meta">
                <span class="paper-markdown-view__note-type">
                  {{ composer.getAnnotationTypeLabel(annotation) }}
                </span>
                <span
                  v-if="composer.getAnnotationStatusLabel(annotation)"
                  class="paper-markdown-view__note-status"
                >
                  {{ composer.getAnnotationStatusLabel(annotation) }}
                </span>
              </div>
              <div class="paper-markdown-view__note-comment">{{ annotation.comment }}</div>
              <div class="paper-markdown-view__note-selection">
                {{ annotation.selectedTextSnapshot }}
              </div>
              <div
                v-if="composer.isAnnotationOutdated(annotation)"
                class="paper-markdown-view__note-banner paper-markdown-view__note-banner--info"
              >
                <div class="paper-markdown-view__note-banner-title">该笔记基于旧版译文创建</div>
                <div class="paper-markdown-view__note-banner-text">
                  当前译文版本已更新，若高亮位置有偏移，可以一键更新到当前译文，或手动重新选择。
                </div>
                <div class="paper-markdown-view__status-actions">
                  <button
                    class="sm-button sm-button--secondary"
                    type="button"
                    @click="paperReaderStore.hideTranslation()"
                  >
                    查看原文位置
                  </button>
                  <button
                    class="sm-button sm-button--primary"
                    type="button"
                    @click="composer.updateAnnotationToCurrentTranslation(annotation)"
                  >
                    更新到当前译文
                  </button>
                  <button
                    class="sm-button sm-button--secondary"
                    type="button"
                    @click="composer.dismissOutdatedAnnotation(annotation.id)"
                  >
                    忽略
                  </button>
                </div>
              </div>
              <div class="paper-markdown-view__note-actions">
                <button
                  v-if="annotation.status === 'needs_reanchor' || annotation.status === 'invalid'"
                  class="sm-button sm-button--secondary sm-button--small"
                  type="button"
                  @click="composer.startRebind(annotation)"
                >
                  手动重新绑定
                </button>
                <button
                  class="paper-markdown-view__note-delete"
                  type="button"
                  @click="composer.handleDeleteAnnotation(annotation.id)"
                >
                  删除
                </button>
              </div>
            </article>
          </div>
        </section>
      </article>
    </div>

    <div
      v-if="composer.composerDraft.value"
      class="paper-markdown-view__composer"
      :style="{
        left: `${composer.composerDraft.value.x}px`,
        top: `${composer.composerDraft.value.y}px`
      }"
    >
      <div class="paper-markdown-view__composer-title">
        {{
          composer.composerDraft.value.mode === 'rebind'
            ? composer.composerDraft.value.viewKind === 'original'
              ? '重新绑定到原文位置'
              : '重新绑定到译文位置'
            : composer.composerDraft.value.viewKind === 'original'
              ? '新增原文笔记'
              : '新增译文视图笔记'
        }}
      </div>
      <div class="paper-markdown-view__composer-selection">
        {{ composer.composerDraft.value.selectedText }}
      </div>
      <textarea
        v-model="composer.composerComment.value"
        class="paper-markdown-view__composer-input"
        rows="7"
        placeholder="写下这段内容的笔记..."
      />
      <div class="paper-markdown-view__composer-row">
        <input
          v-model="composer.composerColor.value"
          class="paper-markdown-view__composer-color"
          type="color"
        />
        <button
          class="sm-button sm-button--secondary"
          type="button"
          @click="composer.handleCancelComposer"
        >
          {{ composer.composerDraft.value.mode === 'rebind' ? '取消重绑' : '取消' }}
        </button>
        <button
          class="sm-button sm-button--primary"
          type="button"
          :disabled="composer.composerSaving.value"
          @click="composer.handleCreateAnnotation"
        >
          {{
            composer.composerSaving.value
              ? '保存中...'
              : composer.composerDraft.value.mode === 'rebind'
                ? '确认重新绑定'
                : '保存笔记'
          }}
        </button>
      </div>
      <p v-if="composer.composerError.value" class="paper-markdown-view__composer-error">
        {{ composer.composerError.value }}
      </p>
      <p
        v-if="composer.composerDraft.value.mode === 'rebind'"
        class="paper-markdown-view__composer-hint"
      >
        当前正在重绑已有笔记。保存后会保留原始创建时间，只更新定位与笔记内容。
      </p>
      <p
        v-if="composer.composerDraft.value.viewKind === 'translation'"
        class="paper-markdown-view__composer-hint"
      >
        该笔记会归属于当前原文段落语义，译文位置依赖当前翻译版本。
      </p>
    </div>
  </div>
</template>

<style scoped>
.paper-markdown-view {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.paper-markdown-view__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--sm-space-3) var(--sm-space-4) var(--sm-space-6);
}

.paper-markdown-view__loading,
.paper-markdown-view__error,
.paper-markdown-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  font-size: 14px;
  color: var(--sm-color-text-tertiary);
}

.paper-markdown-view__error {
  color: var(--sm-color-status-danger);
}

.paper-markdown-view__content {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.paper-markdown-view__status-panel,
.paper-markdown-view__manager {
  margin-bottom: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 16px;
  background: var(--sm-color-surface-1);
  padding: var(--sm-space-4);
}

.paper-markdown-view__status-panel--warning {
  background: linear-gradient(180deg, var(--sm-color-surface-1), var(--sm-color-surface-2));
}

.paper-markdown-view__status-panel--info {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--sm-color-accent-08) 70%, var(--sm-color-surface-1)),
    var(--sm-color-surface-1)
  );
}

.paper-markdown-view__status-title,
.paper-markdown-view__manager-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__status-text,
.paper-markdown-view__manager-text {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  margin-top: var(--sm-space-3);
}

.paper-markdown-view__manager-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.paper-markdown-view__manager-card {
  margin-top: var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 14px;
  background: var(--sm-color-surface-2);
  padding: var(--sm-space-3);
}

.paper-markdown-view__manager-card--active {
  border-color: var(--sm-color-border-accent);
  background: color-mix(in srgb, var(--sm-color-accent-08) 68%, var(--sm-color-surface-2));
}

.paper-markdown-view__manager-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  align-items: center;
}

.paper-markdown-view__manager-comment {
  margin-top: var(--sm-space-2);
  font-size: 13px;
  line-height: 1.75;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__manager-selection {
  margin-top: var(--sm-space-2);
  font-size: 12px;
  line-height: 1.65;
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__segment {
  position: relative;
}

.paper-markdown-view__segment + .paper-markdown-view__segment {
  margin-top: var(--sm-space-3);
}

.paper-markdown-view__segment-tag {
  position: absolute;
  top: -8px;
  right: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--sm-color-accent-12);
  color: var(--sm-color-text-secondary);
  font-size: 11px;
  z-index: 1;
}

.paper-markdown-view__segment-original,
.paper-markdown-view__segment-translation {
  box-sizing: border-box;
}

.paper-markdown-view__segment-translation {
  margin-top: var(--sm-space-2);
}

.paper-markdown-view__segment-translation.is-queued,
.paper-markdown-view__segment-translation.is-translating {
  opacity: 0.9;
}

.paper-markdown-view__translation-error {
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.paper-markdown-view__translation-placeholder {
  display: grid;
  gap: var(--sm-space-2);
  padding: var(--sm-space-1) 0;
}

.paper-markdown-view__translation-placeholder-text {
  display: block;
  font-size: 13px;
  color: var(--sm-color-text-tertiary);
  margin-bottom: var(--sm-space-1);
}

.paper-markdown-view__translation-placeholder-bar {
  display: block;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--sm-color-border-subtle) 65%, transparent) 0%,
    color-mix(in srgb, var(--sm-color-text-tertiary) 16%, transparent) 50%,
    color-mix(in srgb, var(--sm-color-border-subtle) 65%, transparent) 100%
  );
  background-size: 180% 100%;
  animation: paper-translation-breathe 1.8s ease-in-out infinite;
}

.paper-markdown-view__translation-placeholder-bar:nth-child(2) {
  width: 92%;
  animation-delay: 0.12s;
}

.paper-markdown-view__translation-placeholder-bar:nth-child(3) {
  width: 78%;
  animation-delay: 0.24s;
}

.paper-markdown-view__markdown {
  width: 100%;
  font-size: 15px;
  line-height: 1.75;
  color: var(--sm-color-text-primary);
  user-select: text;
  box-sizing: border-box;
  overflow-x: hidden;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.paper-markdown-view__segment-translation-body {
  width: 100%;
}

.paper-markdown-view__segment--meta .paper-markdown-view__markdown {
  text-align: center;
}

.paper-markdown-view__notes {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.paper-markdown-view__note {
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  border-radius: 12px;
  padding: 12px 14px;
}

.paper-markdown-view__note-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.paper-markdown-view__note-type,
.paper-markdown-view__note-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
}

.paper-markdown-view__note-type {
  background: var(--sm-color-accent-12);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__note-status {
  background: color-mix(in srgb, var(--sm-color-status-warning) 18%, transparent);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__note-comment {
  font-size: 13px;
  line-height: 1.7;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__note-selection {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-tertiary);
}

.paper-markdown-view__note-banner {
  margin-top: var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 12px;
  padding: 12px;
  background: var(--sm-color-surface-2);
}

.paper-markdown-view__note-banner--info {
  border-color: var(--sm-color-border-accent);
  background: color-mix(in srgb, var(--sm-color-accent-08) 72%, var(--sm-color-surface-2));
}

.paper-markdown-view__note-banner-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__note-banner-text {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__note-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-2);
  margin-top: var(--sm-space-3);
}

.paper-markdown-view__note-delete {
  border: none;
  background: transparent;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.paper-markdown-view__composer {
  position: fixed;
  width: min(440px, calc(100vw - 32px));
  min-height: 320px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  box-shadow:
    0 24px 56px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  z-index: 20;
  backdrop-filter: blur(18px);
}

.paper-markdown-view__composer-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__composer-selection {
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
  max-height: 104px;
  overflow: auto;
}

.paper-markdown-view__composer-input {
  width: 100%;
  min-height: 180px;
  margin-top: 12px;
  border-radius: 12px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
  padding: 12px;
  resize: vertical;
  font: inherit;
  box-sizing: border-box;
}

.paper-markdown-view__composer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.paper-markdown-view__composer-color {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 12px;
  background: var(--sm-color-surface-2);
}

.paper-markdown-view__composer-error {
  margin: 8px 0 0;
  color: var(--sm-color-status-danger);
  font-size: 12px;
}

.paper-markdown-view__composer-hint {
  margin: 8px 0 0;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

.paper-markdown-view__markdown > :first-child {
  margin-top: 0;
}

.paper-markdown-view__markdown > :last-child {
  margin-bottom: 0;
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight) {
  border-radius: 4px;
  color: inherit;
  padding: 0 1px;
}

.paper-markdown-view__markdown :deep(h1) {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  margin: 1.2em 0 0.6em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :deep(h2) {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
  margin: 1.1em 0 0.55em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :deep(h3) {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
  margin: 1em 0 0.5em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :deep(p) {
  margin: 0.8em 0;
}

.paper-markdown-view__markdown :deep(a) {
  color: var(--sm-color-accent-hover);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.paper-markdown-view__markdown :deep(a:hover) {
  opacity: 0.85;
}

.paper-markdown-view__markdown :deep(eq) {
  display: inline-block;
  vertical-align: baseline;
}

.paper-markdown-view__markdown :deep(eqn) {
  display: block;
}

.paper-markdown-view__markdown :deep(.katex) {
  font-size: 1em;
}

.paper-markdown-view__markdown :deep(.katex-display) {
  margin: 1.25em 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2em 0;
}

.paper-markdown-view__markdown :deep(.katex-display > .katex) {
  display: inline-block;
  min-width: min-content;
}

.paper-markdown-view__markdown :deep(pre) {
  margin: 1em 0;
  padding: var(--sm-space-4);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-1);
  font-family: var(--sm-font-mono);
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}

.paper-markdown-view__markdown :deep(code) {
  font-family: var(--sm-font-mono);
  font-size: 0.9em;
}

.paper-markdown-view__markdown :deep(:not(pre) > code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--sm-color-surface-hover);
  font-size: 0.88em;
}

.paper-markdown-view__markdown :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 16px auto;
  display: block;
}

.paper-markdown-view__markdown :deep(.paper-markdown-view__table-wrap) {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable both-edges;
}

.paper-markdown-view__markdown :deep(.paper-markdown-view__table-wrap > table) {
  width: max-content;
  min-width: 100%;
  margin: 0;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: auto;
  font-size: 14px;
}

.paper-markdown-view__markdown :deep(th),
.paper-markdown-view__markdown :deep(td) {
  padding: var(--sm-space-2) var(--sm-space-3);
  border: 1px solid var(--sm-color-border-subtle);
  text-align: left;
  vertical-align: top;
}

.paper-markdown-view__markdown :deep(th) {
  font-weight: 600;
  background: var(--sm-color-surface-1);
}

.paper-markdown-view__markdown :deep(blockquote) {
  margin: 1em 0;
  padding: var(--sm-space-3) var(--sm-space-4);
  border-left: 3px solid var(--sm-color-border-strong);
  border-radius: 0 var(--sm-radius-sm) var(--sm-radius-sm) 0;
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__markdown :deep(blockquote p) {
  margin: 0.4em 0;
}

.paper-markdown-view__markdown :deep(ul),
.paper-markdown-view__markdown :deep(ol) {
  margin: 0.6em 0;
  padding-inline-start: 2.8em;
}

.paper-markdown-view__markdown :deep(li) {
  margin: 0.25em 0;
}

.paper-markdown-view__markdown :deep(li > p) {
  margin: 0.2em 0;
}

.paper-markdown-view__markdown :deep(li > ul),
.paper-markdown-view__markdown :deep(li > ol) {
  margin: 0.25em 0;
}

@keyframes paper-translation-breathe {
  0%,
  100% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }
}
</style>
