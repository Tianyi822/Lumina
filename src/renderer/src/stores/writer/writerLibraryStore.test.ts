import test from 'node:test'
import assert from 'node:assert/strict'
import type { WriterApi } from '../../../../preload/types/writer'
import type { WriterDocument, WriterDocumentSummary, WriterIndex } from '@shared/types/writer'
import {
  getWriterDocumentVirtualizationConfig,
  getWriterSidebarDocumentRenderPlan,
  groupWriterFolderDocuments,
  useWriterLibraryStore
} from './writerLibraryStore'

function createDocumentFixture(overrides: Partial<WriterDocumentSummary> = {}): WriterDocument {
  return {
    schemaVersion: 1,
    id: 'writer-document',
    revision: 0,
    title: '研究笔记',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    favorite: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides
  }
}

function createIndex(documents: WriterDocumentSummary[] = []): WriterIndex {
  return { schemaVersion: 1, folders: [], documents, recentDocumentIds: [] }
}

function mockWriterApi(overrides: Partial<WriterApi>): void {
  const writer: WriterApi = {
    list: async () => ({ success: true, data: createIndex() }),
    create: async () => ({ success: true, data: createDocumentFixture() }),
    get: async () => ({ success: true, data: createDocumentFixture() }),
    save: async () => ({ success: true, data: createDocumentFixture() }),
    delete: async () => ({ success: true }),
    rename: async () => ({ success: true, data: createDocumentFixture() }),
    move: async () => ({ success: true, data: createDocumentFixture() }),
    setFavorite: async () => ({ success: true, data: createDocumentFixture() }),
    createFolder: async () => ({ success: false, error: '未配置' }),
    renameFolder: async () => ({ success: false, error: '未配置' }),
    deleteFolder: async () => ({ success: true }),
    importAsset: async () => ({ success: false, error: '未配置' }),
    onFlushRequested: () => () => undefined,
    acknowledgeFlush: async () => undefined,
    ...overrides
  }
  ;(globalThis as { window: Window }).window = { api: { writer } } as unknown as Window
}

function resetStore(): void {
  useWriterLibraryStore.setState({
    documents: [],
    folders: [],
    recentDocumentIds: [],
    currentDocumentId: null,
    searchQuery: '',
    sidebarMode: 'documents',
    activeCollection: 'all',
    isLoading: false,
    error: null
  })
}

test('createAndOpen 创建空白文档并设为当前文档', async () => {
  resetStore()
  const created = createDocumentFixture({ id: 'writer-new-document' })
  mockWriterApi({ create: async () => ({ success: true, data: created }) })

  await useWriterLibraryStore.getState().createAndOpen()

  assert.equal(useWriterLibraryStore.getState().currentDocumentId, created.id)
  assert.equal(useWriterLibraryStore.getState().documents[0].id, created.id)
})

test('搜索同时匹配标题且清空搜索后恢复当前集合', () => {
  resetStore()
  useWriterLibraryStore.setState({
    documents: [
      createDocumentFixture({ id: 'writer-1', title: '量子计算笔记' }),
      createDocumentFixture({ id: 'writer-2', title: '会议纪要' })
    ]
  })

  useWriterLibraryStore.getState().setSearchQuery('量子')
  assert.deepEqual(
    useWriterLibraryStore
      .getState()
      .visibleDocuments()
      .map((item) => item.id),
    ['writer-1']
  )

  useWriterLibraryStore.getState().setSearchQuery('')
  assert.deepEqual(
    useWriterLibraryStore
      .getState()
      .visibleDocuments()
      .map((item) => item.id),
    ['writer-1', 'writer-2']
  )
})

test('收藏置顶且同一收藏状态内仍按更新时间排序', () => {
  resetStore()
  useWriterLibraryStore.setState({
    documents: [
      createDocumentFixture({
        id: 'writer-old-favorite',
        favorite: true,
        updatedAt: '2026-07-01T00:00:00.000Z'
      }),
      createDocumentFixture({
        id: 'writer-new-favorite',
        favorite: true,
        updatedAt: '2026-07-03T00:00:00.000Z'
      }),
      createDocumentFixture({
        id: 'writer-new',
        favorite: false,
        updatedAt: '2026-07-04T00:00:00.000Z'
      })
    ]
  })

  assert.deepEqual(
    useWriterLibraryStore
      .getState()
      .visibleDocuments()
      .map((item) => item.id),
    ['writer-new-favorite', 'writer-old-favorite', 'writer-new']
  )
})

test('永久删除失败时保留列表项并暴露错误', async () => {
  resetStore()
  useWriterLibraryStore.setState({ documents: [createDocumentFixture({ id: 'writer-keep' })] })
  mockWriterApi({ delete: async () => ({ success: false, error: '磁盘不可用' }) })

  await useWriterLibraryStore.getState().deletePermanently('writer-keep')

  assert.deepEqual(
    useWriterLibraryStore.getState().documents.map((item) => item.id),
    ['writer-keep']
  )
  assert.equal(useWriterLibraryStore.getState().error, '磁盘不可用')
})

test('超过 200 个文档时使用独立滚动容器并启用实际行高测量', () => {
  assert.deepEqual(getWriterDocumentVirtualizationConfig(200), {
    enabled: false,
    scrollContainer: 'document-list',
    measureRows: true
  })
  assert.deepEqual(getWriterDocumentVirtualizationConfig(201), {
    enabled: true,
    scrollContainer: 'document-list',
    measureRows: true
  })
})

test('文件夹分组只包含所属文档，供展开节点直接渲染', () => {
  const groups = groupWriterFolderDocuments(
    [
      createDocumentFixture({ id: 'writer-in-folder', folderId: 'folder-1' }),
      createDocumentFixture({ id: 'writer-root' })
    ],
    [{ id: 'folder-1', name: '项目文档', sortOrder: 0, createdAt: '', updatedAt: '' }]
  )

  assert.equal(groups.length, 1)
  assert.equal(groups[0].folderId, 'folder-1')
  assert.deepEqual(
    groups[0].documents.map((document) => document.id),
    ['writer-in-folder']
  )
})

test('展开大文件夹时每个文档只分配到一个渲染节点，并为文件夹选择虚拟列表', () => {
  const folder = { id: 'folder-1', name: '项目文档', sortOrder: 0, createdAt: '', updatedAt: '' }
  const documents = [
    createDocumentFixture({ id: 'writer-root' }),
    ...Array.from({ length: 201 }, (_, index) =>
      createDocumentFixture({ id: `writer-folder-${index}`, folderId: folder.id })
    )
  ]

  const plan = getWriterSidebarDocumentRenderPlan({
    documents,
    folders: [folder],
    collection: 'all',
    expandedFolderIds: new Set([folder.id])
  })

  assert.deepEqual(
    plan.map((bucket) => [bucket.id, bucket.placement, bucket.virtualized]),
    [
      ['root', 'root', false],
      ['folder-1', 'folder', true]
    ]
  )
  assert.equal(
    new Set(plan.flatMap((bucket) => bucket.documents.map((document) => document.id))).size,
    202
  )
  assert.deepEqual(
    new Set(plan[1].documents.map((document) => document.id)),
    new Set(Array.from({ length: 201 }, (_, index) => `writer-folder-${index}`))
  )
})
