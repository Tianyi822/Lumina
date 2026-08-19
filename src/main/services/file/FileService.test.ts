import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  FileService,
  getFilesStoragePath,
  getLegacyPaperNoteResourceId,
  getPaperNoteResourceId
} from './FileService.ts'
import { getFilesMetadataPath, getKnowledgeBaseFilePath } from '../knowledge/knowledgePaths.ts'
import { getKnowledgeDirPath } from '../config/configPaths.ts'
import { getVectorDBService } from '../vector/index.ts'
import type { KnowledgeBase, FileItem } from '../../../shared/types/knowledge.ts'
import type {
  PaperAnnotation,
  PaperDocument,
  PaperReaderSegment
} from '../../../shared/types/paper.ts'
import { PAPER_ANNOTATION_NOTE_COLOR_KEY } from '../../../shared/types/paper.ts'
import { buildPaperTextAnchor } from '../../../shared/utils/paperAnnotationAnchors.ts'

function resetKnowledgeStorage(): void {
  rmSync(getKnowledgeDirPath(), { recursive: true, force: true })
}

function createPaper(overrides: Partial<PaperDocument> = {}): PaperDocument {
  const paperPath = join(tmpdir(), 'lumina-file-service-paper.pdf')
  writeFileSync(paperPath, 'paper-pdf')

  return {
    id: overrides.id ?? 'paper-1',
    fileName: overrides.fileName ?? 'sample-paper.pdf',
    filePath: overrides.filePath ?? paperPath,
    fileHash: overrides.fileHash ?? 'paper-hash',
    fileSize: overrides.fileSize ?? 9,
    pageCount: overrides.pageCount ?? 3,
    status: overrides.status ?? 'completed',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    lastOpenedAt: overrides.lastOpenedAt ?? '2026-01-01T00:00:00.000Z',
    ocrProvider: overrides.ocrProvider ?? 'glm-ocr',
    ocrModel: overrides.ocrModel ?? 'glm-ocr',
    completedPageCount: overrides.completedPageCount ?? 3
  }
}

function createSegment(): PaperReaderSegment {
  return {
    id: 'segment-1',
    renderId: 'render-1',
    stableId: 'stable-1',
    index: 0,
    kind: 'paragraph',
    originalMarkdown: 'Before context. Selected claim. After context.',
    originalText: 'Before context. Selected claim. After context.',
    textHash: 'hash-1',
    duplicateOrdinal: 1,
    sourceRevisionId: 'revision-1',
    sourceRefs: {
      pageIndexes: [0],
      blockIndexes: [2],
      start: { pageIndex: 0, blockIndex: 2 },
      end: { pageIndex: 0, blockIndex: 2 }
    }
  }
}

function createSourceRefs(pageIndex: number, blockIndex: number): PaperReaderSegment['sourceRefs'] {
  return {
    pageIndexes: [pageIndex],
    blockIndexes: [blockIndex],
    start: { pageIndex, blockIndex },
    end: { pageIndex, blockIndex }
  }
}

function createNoteAnnotation(overrides: Partial<PaperAnnotation> = {}): PaperAnnotation {
  const segment = createSegment()
  const anchor = buildPaperTextAnchor(segment.originalText, 16, 30)

  return {
    id: overrides.id ?? 'annotation-1',
    paperId: overrides.paperId ?? 'paper-1',
    kind: overrides.kind ?? 'note',
    noteType: overrides.noteType ?? 'original_span',
    createdInView: overrides.createdInView ?? 'original',
    semanticAnchor: overrides.semanticAnchor ?? {
      segmentStableId: segment.stableId,
      renderSegmentIdAtCreation: segment.renderId,
      sourceRevisionId: segment.sourceRevisionId,
      segmentTextHash: segment.textHash,
      sourceRefs: segment.sourceRefs
    },
    originalAnchor: overrides.originalAnchor ?? anchor,
    translationAnchor: overrides.translationAnchor,
    selectedTextSnapshot: overrides.selectedTextSnapshot ?? anchor.selectedText,
    contextBefore: overrides.contextBefore ?? anchor.prefixText,
    contextAfter: overrides.contextAfter ?? anchor.suffixText,
    comment: overrides.comment ?? '这是一条进入知识库的论文笔记',
    colorKey: overrides.colorKey ?? PAPER_ANNOTATION_NOTE_COLOR_KEY,
    status: overrides.status ?? 'active',
    recoveryMeta: overrides.recoveryMeta ?? { recoveryFailureCount: 0 },
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z'
  }
}

function createKnowledgeBase(): KnowledgeBase {
  return {
    id: 'kb-1',
    name: '测试知识库',
    embeddingConfig: {
      baseUrl: 'http://localhost',
      model: 'test-embedding',
      dimensions: 3
    },
    embeddingDimension: 3,
    chunkSize: 500,
    chunkOverlap: 50,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    documentCount: 0,
    linkedFileIds: []
  }
}

function mockDeleteFileChunks(
  behavior: (kbId: string, fileId: string) => Promise<void> | void = () => undefined
): { calls: Array<{ kbId: string; fileId: string }>; restore: () => void } {
  const calls: Array<{ kbId: string; fileId: string }> = []
  const deleteMock = mock.method(
    getVectorDBService(),
    'deleteFileChunks',
    async (kbId: string, fileId: string) => {
      calls.push({ kbId, fileId })
      await behavior(kbId, fileId)
    }
  )

  return {
    calls,
    restore: () => deleteMock.mock.restore()
  }
}

test('registerPaperFile 只登记论文引用资源，不复制 PDF 到知识库文件目录', async () => {
  resetKnowledgeStorage()
  const service = new FileService()
  await service.initialize()
  const paper = createPaper()

  const result = await service.registerPaperFile(paper)

  assert.equal(result.success, true)
  assert.equal(result.file?.sourceKind, 'paper_file')
  assert.equal(result.file?.absolutePath, paper.filePath)
  assert.equal(result.file?.origin?.allowDelete, false)
  assert.equal(result.file?.origin?.paperId, paper.id)
  assert.equal(readdirSync(getFilesStoragePath()).length, 0)
})

test('upsertPaperNotesResource 会按论文聚合并按页码排序笔记内容', async () => {
  resetKnowledgeStorage()
  const service = new FileService()
  await service.initialize()
  const paper = createPaper()
  const laterAnnotation = createNoteAnnotation({
    id: 'annotation-page-2',
    comment: '第二页笔记',
    semanticAnchor: {
      ...createNoteAnnotation().semanticAnchor,
      sourceRefs: createSourceRefs(1, 1)
    },
    updatedAt: '2026-01-03T00:00:00.000Z'
  })
  const earlierAnnotation = createNoteAnnotation({
    id: 'annotation-page-1',
    comment: '第一页笔记',
    semanticAnchor: {
      ...createNoteAnnotation().semanticAnchor,
      sourceRefs: createSourceRefs(0, 2)
    },
    updatedAt: '2026-01-02T00:00:00.000Z'
  })

  const result = await service.upsertPaperNotesResource(paper, [laterAnnotation, earlierAnnotation])
  const contentResult = await service.readFileResourceContent(result.file!.id)

  assert.equal(result.success, true)
  assert.equal(result.file?.id, getPaperNoteResourceId(paper.id))
  assert.equal(result.file?.name, `${paper.fileName} - 论文笔记.md`)
  assert.equal(result.file?.name.includes(laterAnnotation.id.slice(0, 8)), false)
  assert.equal(result.file?.sourceKind, 'paper_note')
  assert.equal(result.file?.origin?.allowExternalOpen, false)
  assert.equal(result.file?.origin?.annotationId, undefined)
  assert.match(result.file?.origin?.summary || '', /2 条笔记/)
  assert.equal(contentResult.success, true)
  assert.match(contentResult.data!.content, /sample-paper\.pdf/)
  assert.match(contentResult.data!.content, /笔记数量：2/)
  assert.match(contentResult.data!.content, /第一页笔记/)
  assert.match(contentResult.data!.content, /第二页笔记/)
  assert.ok(
    contentResult.data!.content.indexOf('第一页笔记') <
      contentResult.data!.content.indexOf('第二页笔记')
  )
  assert.match(contentResult.data!.content, /Selected claim/)
  assert.match(contentResult.data!.content, /Before context/)
  assert.match(contentResult.data!.content, /After context/)
})

test('upsertPaperNotesResource 会合并旧版逐批注资源并迁移知识库关联', async () => {
  resetKnowledgeStorage()
  mkdirSync(getKnowledgeDirPath(), { recursive: true })
  const kb1 = createKnowledgeBase()
  const kb2: KnowledgeBase = { ...createKnowledgeBase(), id: 'kb-2', name: '测试知识库二' }
  const paper = createPaper()
  const firstAnnotation = createNoteAnnotation({
    id: 'annotation-legacy-1',
    comment: '旧资源一的新内容',
    semanticAnchor: {
      ...createNoteAnnotation().semanticAnchor,
      sourceRefs: createSourceRefs(0, 1)
    }
  })
  const secondAnnotation = createNoteAnnotation({
    id: 'annotation-legacy-2',
    comment: '旧资源二的新内容',
    semanticAnchor: {
      ...createNoteAnnotation().semanticAnchor,
      sourceRefs: createSourceRefs(1, 1)
    }
  })
  const legacyFile1Id = getLegacyPaperNoteResourceId(paper.id, firstAnnotation.id)
  const legacyFile2Id = getLegacyPaperNoteResourceId(paper.id, secondAnnotation.id)
  const legacyFiles: FileItem[] = [
    {
      id: legacyFile1Id,
      name: `${paper.fileName} - 笔记 legacy1.md`,
      filePath: `paper://${paper.id}/annotations/${firstAnnotation.id}.md`,
      absolutePath: '',
      fileType: 'md',
      size: 10,
      uploadedAt: firstAnnotation.createdAt,
      usedByKBIds: ['kb-1'],
      contentHash: 'legacy-hash-1',
      sourceKind: 'paper_note',
      origin: {
        paperId: paper.id,
        annotationId: firstAnnotation.id,
        paperName: paper.fileName,
        displayName: '论文笔记',
        summary: '旧资源一',
        noteContent: '旧资源一',
        allowExternalOpen: false,
        allowDelete: false,
        updatedAt: firstAnnotation.updatedAt
      }
    },
    {
      id: legacyFile2Id,
      name: `${paper.fileName} - 笔记 legacy2.md`,
      filePath: `paper://${paper.id}/annotations/${secondAnnotation.id}.md`,
      absolutePath: '',
      fileType: 'md',
      size: 10,
      uploadedAt: secondAnnotation.createdAt,
      usedByKBIds: ['kb-2'],
      contentHash: 'legacy-hash-2',
      sourceKind: 'paper_note',
      origin: {
        paperId: paper.id,
        annotationId: secondAnnotation.id,
        paperName: paper.fileName,
        displayName: '论文笔记',
        summary: '旧资源二',
        noteContent: '旧资源二',
        allowExternalOpen: false,
        allowDelete: false,
        updatedAt: secondAnnotation.updatedAt
      }
    }
  ]

  kb1.linkedFileIds = [legacyFile1Id]
  kb1.documentCount = 1
  kb2.linkedFileIds = [legacyFile2Id]
  kb2.documentCount = 1
  writeFileSync(getKnowledgeBaseFilePath(), JSON.stringify([kb1, kb2], null, 2), 'utf-8')
  writeFileSync(getFilesMetadataPath(), JSON.stringify(legacyFiles, null, 2), 'utf-8')

  const service = new FileService()
  await service.initialize()
  const result = await service.upsertPaperNotesResource(paper, [secondAnnotation, firstAnnotation])
  const aggregateFileId = getPaperNoteResourceId(paper.id)
  const knowledgeBases = JSON.parse(
    readFileSync(getKnowledgeBaseFilePath(), 'utf-8')
  ) as KnowledgeBase[]

  assert.equal(result.success, true)
  assert.equal(result.legacyMigrated, true)
  assert.deepEqual(result.previousUsedByKBIds?.sort(), ['kb-1', 'kb-2'])
  assert.deepEqual(result.removedFileIds?.sort(), [legacyFile1Id, legacyFile2Id].sort())
  assert.equal(service.getFileById(legacyFile1Id), null)
  assert.equal(service.getFileById(legacyFile2Id), null)
  assert.equal(service.getFileById(aggregateFileId)?.id, aggregateFileId)
  assert.deepEqual(service.getFileById(aggregateFileId)?.usedByKBIds.sort(), ['kb-1', 'kb-2'])
  assert.deepEqual(
    knowledgeBases.map((kb) => kb.linkedFileIds),
    [[aggregateFileId], [aggregateFileId]]
  )
  assert.deepEqual(
    knowledgeBases.map((kb) => kb.documentCount),
    [1, 1]
  )
})

test('removePaperResources 会移除论文资源、笔记资源和知识库关联', async () => {
  resetKnowledgeStorage()
  const service = new FileService()
  await service.initialize()
  mkdirSync(getKnowledgeDirPath(), { recursive: true })
  writeFileSync(getKnowledgeBaseFilePath(), JSON.stringify([createKnowledgeBase()], null, 2))
  const paper = createPaper()
  const annotation = createNoteAnnotation()
  const paperFile = (await service.registerPaperFile(paper)).file as FileItem
  const noteFile = (await service.upsertPaperNotesResource(paper, [annotation])).file as FileItem

  assert.equal((await service.linkFileToKB(paperFile.id, 'kb-1')).success, true)
  assert.equal((await service.linkFileToKB(noteFile.id, 'kb-1')).success, true)

  const result = await service.removePaperResources(paper.id)
  const knowledgeBases = JSON.parse(
    readFileSync(getKnowledgeBaseFilePath(), 'utf-8')
  ) as KnowledgeBase[]

  assert.equal(result.success, true)
  assert.equal(service.getAllFiles().length, 0)
  assert.deepEqual(knowledgeBases[0].linkedFileIds, [])
  assert.equal(knowledgeBases[0].documentCount, 0)
})

test('unlinkFileFromKB 会清理论文笔记对应的索引失效状态', async () => {
  resetKnowledgeStorage()
  const service = new FileService()
  await service.initialize()
  mkdirSync(getKnowledgeDirPath(), { recursive: true })
  writeFileSync(getKnowledgeBaseFilePath(), JSON.stringify([createKnowledgeBase()], null, 2))
  const paper = createPaper()
  const annotation = createNoteAnnotation()
  const noteFile = (await service.upsertPaperNotesResource(paper, [annotation])).file as FileItem

  assert.equal((await service.linkFileToKB(noteFile.id, 'kb-1')).success, true)

  const knowledgeBases = JSON.parse(
    readFileSync(getKnowledgeBaseFilePath(), 'utf-8')
  ) as KnowledgeBase[]
  knowledgeBases[0].indexInvalidation = {
    needsReindex: true,
    reason: 'paper_note_updated',
    markedAt: '2026-01-02T00:00:00.000Z',
    files: [
      {
        fileId: noteFile.id,
        fileName: noteFile.name,
        paperId: paper.id,
        updatedAt: annotation.updatedAt
      }
    ]
  }
  writeFileSync(getKnowledgeBaseFilePath(), JSON.stringify(knowledgeBases, null, 2))

  const result = await service.unlinkFileFromKB(noteFile.id, 'kb-1')
  const nextKnowledgeBases = JSON.parse(
    readFileSync(getKnowledgeBaseFilePath(), 'utf-8')
  ) as KnowledgeBase[]

  assert.equal(result.success, true)
  assert.equal(nextKnowledgeBases[0].indexInvalidation, undefined)
})

test('unlinkFileFromKB 会先删除该文件向量块再清理关联', async () => {
  resetKnowledgeStorage()
  mkdirSync(getKnowledgeDirPath(), { recursive: true })
  writeFileSync(getKnowledgeBaseFilePath(), JSON.stringify([createKnowledgeBase()], null, 2))
  const service = new FileService()
  await service.initialize()
  const uploadResult = await service.uploadFile(Buffer.from('knowledge text'), 'knowledge.md')
  const file = uploadResult.file as FileItem

  assert.equal(uploadResult.success, true)
  assert.equal((await service.linkFileToKB(file.id, 'kb-1')).success, true)

  const vectorDelete = mockDeleteFileChunks()
  try {
    const result = await service.unlinkFileFromKB(file.id, 'kb-1')

    assert.equal(result.success, true)
    assert.deepEqual(vectorDelete.calls, [{ kbId: 'kb-1', fileId: file.id }])
    assert.deepEqual(service.getFileById(file.id)?.usedByKBIds, [])
  } finally {
    vectorDelete.restore()
  }
})

test('unlinkFileFromKB 删除向量失败时不会修改关联元数据', async () => {
  resetKnowledgeStorage()
  mkdirSync(getKnowledgeDirPath(), { recursive: true })
  writeFileSync(getKnowledgeBaseFilePath(), JSON.stringify([createKnowledgeBase()], null, 2))
  const service = new FileService()
  await service.initialize()
  const uploadResult = await service.uploadFile(Buffer.from('knowledge text'), 'knowledge.md')
  const file = uploadResult.file as FileItem

  assert.equal(uploadResult.success, true)
  assert.equal((await service.linkFileToKB(file.id, 'kb-1')).success, true)

  const vectorDelete = mockDeleteFileChunks(async () => {
    throw new Error('vector unavailable')
  })

  try {
    const result = await service.unlinkFileFromKB(file.id, 'kb-1')
    const nextKnowledgeBases = JSON.parse(
      readFileSync(getKnowledgeBaseFilePath(), 'utf-8')
    ) as KnowledgeBase[]

    assert.equal(result.success, false)
    assert.match(result.error || '', /vector unavailable/)
    assert.deepEqual(vectorDelete.calls, [{ kbId: 'kb-1', fileId: file.id }])
    assert.deepEqual(service.getFileById(file.id)?.usedByKBIds, ['kb-1'])
    assert.deepEqual(nextKnowledgeBases[0].linkedFileIds, [file.id])
    assert.equal(nextKnowledgeBases[0].documentCount, 1)
  } finally {
    vectorDelete.restore()
  }
})

test('deleteFile 强制删除多知识库文件时向量删除失败会保留所有元数据', async () => {
  resetKnowledgeStorage()
  mkdirSync(getKnowledgeDirPath(), { recursive: true })
  const kb1 = createKnowledgeBase()
  const kb2: KnowledgeBase = { ...createKnowledgeBase(), id: 'kb-2', name: '测试知识库二' }
  writeFileSync(getKnowledgeBaseFilePath(), JSON.stringify([kb1, kb2], null, 2))
  const service = new FileService()
  await service.initialize()
  const uploadResult = await service.uploadFile(Buffer.from('shared knowledge'), 'shared.md')
  const file = uploadResult.file as FileItem
  const uploadedPath = file.absolutePath

  assert.equal(uploadResult.success, true)
  assert.equal((await service.linkFileToKB(file.id, 'kb-1')).success, true)
  assert.equal((await service.linkFileToKB(file.id, 'kb-2')).success, true)
  assert.equal(existsSync(uploadedPath), true)

  const vectorDelete = mockDeleteFileChunks(async (kbId) => {
    if (kbId === 'kb-2') {
      throw new Error('kb-2 vector delete failed')
    }
  })

  try {
    const result = await service.deleteFile(file.id, true)
    const nextKnowledgeBases = JSON.parse(
      readFileSync(getKnowledgeBaseFilePath(), 'utf-8')
    ) as KnowledgeBase[]

    assert.equal(result.success, false)
    assert.match(result.error || '', /kb-2 vector delete failed/)
    assert.deepEqual(vectorDelete.calls, [
      { kbId: 'kb-1', fileId: file.id },
      { kbId: 'kb-2', fileId: file.id }
    ])
    assert.notEqual(service.getFileById(file.id), null)
    assert.deepEqual(service.getFileById(file.id)?.usedByKBIds.sort(), ['kb-1', 'kb-2'])
    assert.deepEqual(
      nextKnowledgeBases.map((kb) => kb.linkedFileIds),
      [[file.id], [file.id]]
    )
    assert.deepEqual(
      nextKnowledgeBases.map((kb) => kb.documentCount),
      [1, 1]
    )
    assert.equal(existsSync(uploadedPath), true)
  } finally {
    vectorDelete.restore()
  }
})

function createSyncedFileItem(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: overrides.id ?? 'synced-file-1',
    name: overrides.name ?? 'synced-file-1.txt',
    filePath: overrides.filePath ?? 'synced-file-1.txt',
    absolutePath: overrides.absolutePath ?? '',
    fileType: 'text/plain',
    size: 10,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    usedByKBIds: [],
    sourceKind: 'uploaded',
    ...overrides
  } as FileItem
}

async function createServiceWithFiles(files: FileItem[]): Promise<FileService> {
  resetKnowledgeStorage()
  mkdirSync(getKnowledgeDirPath(), { recursive: true })
  writeFileSync(getFilesMetadataPath(), JSON.stringify(files, null, 2), 'utf-8')
  const service = new FileService()
  await service.initialize()
  return service
}

test('applySyncedFileContent 拒绝 ../ 路径注入且不写盘', async () => {
  // filePath 越出 data/files 存储目录（解析到 knowledge 目录下）
  const escapeTarget = join(getKnowledgeDirPath(), 'escaped.txt')
  const service = await createServiceWithFiles([
    createSyncedFileItem({ id: 'evil-dotdot', filePath: '../../escaped.txt' })
  ])
  try {
    const result = await service.applySyncedFileContent('evil-dotdot', new Uint8Array([1, 2, 3]))

    assert.equal(result.success, false)
    assert.match(result.error || '', /非法文件路径/)
    assert.equal(existsSync(escapeTarget), false)
  } finally {
    rmSync(escapeTarget, { force: true })
  }
})

test('applySyncedFileContent 拒绝指向目录外的绝对路径 filePath', async () => {
  const absoluteTarget = join(tmpdir(), `lumina-abs-injection-${process.pid}.txt`)
  const service = await createServiceWithFiles([
    createSyncedFileItem({ id: 'evil-abs', filePath: absoluteTarget })
  ])
  try {
    const result = await service.applySyncedFileContent('evil-abs', new Uint8Array([1, 2, 3]))

    assert.equal(result.success, false)
    assert.match(result.error || '', /非法文件路径/)
    assert.equal(existsSync(absoluteTarget), false)
  } finally {
    rmSync(absoluteTarget, { force: true })
  }
})

test('applySyncedFileDeletion 对目录外 absolutePath 不做物理删除，仅移除 metadata', async () => {
  const outsidePath = join(tmpdir(), `lumina-outside-injection-${process.pid}.txt`)
  writeFileSync(outsidePath, '目录外重要数据')
  const service = await createServiceWithFiles([
    createSyncedFileItem({ id: 'file-outside', absolutePath: outsidePath })
  ])
  try {
    const result = await service.applySyncedFileDeletion('file-outside')

    assert.equal(result.success, true)
    // 目录外文件不被物理删除，metadata 正常移除
    assert.equal(existsSync(outsidePath), true)
    assert.equal(service.getFileById('file-outside'), null)
  } finally {
    rmSync(outsidePath, { force: true })
  }
})

test('applySyncedFileDeletion 对存储目录内文件正常物理删除（对照）', async () => {
  const insidePath = join(getFilesStoragePath(), 'inside.txt')
  const service = await createServiceWithFiles([
    createSyncedFileItem({ id: 'file-inside', filePath: 'inside.txt', absolutePath: insidePath })
  ])
  // 物理文件在 initialize（ensureFilesDir 建目录）之后写入，避免被 resetKnowledgeStorage 清掉
  writeFileSync(insidePath, '目录内文件')

  const result = await service.applySyncedFileDeletion('file-inside')

  assert.equal(result.success, true)
  assert.equal(existsSync(insidePath), false)
  assert.equal(service.getFileById('file-inside'), null)
})

test('applySyncedFilesMetadata 将 uploaded 条目的 absolutePath 归一化为本机存储路径', async () => {
  const service = await createServiceWithFiles([])
  try {
    // 模拟来自设备 A 的远端条目：absolutePath 指向源机器主目录
    const fromRemote = createSyncedFileItem({
      id: 'file-foreign',
      filePath: 'foreign.txt',
      absolutePath: '/Users/other-machine/.lumina/knowledge/data/files/foreign.txt'
    })
    const result = await service.applySyncedFilesMetadata([fromRemote])
    assert.equal(result.success, true)

    const expected = join(getFilesStoragePath(), 'foreign.txt')
    // 内存归一化
    assert.equal(service.getFileById('file-foreign')?.absolutePath, expected)
    // 落盘同样是归一化后的值
    const onDisk = JSON.parse(readFileSync(getFilesMetadataPath(), 'utf-8')) as FileItem[]
    assert.equal(onDisk[0]?.absolutePath, expected)
  } finally {
    resetKnowledgeStorage()
  }
})

test('归一化后跨设备删除能物理删除本机存储目录内文件', async () => {
  // 设备 B：metadata 来自设备 A（foreign absolutePath），文件内容已下行到本机存储目录
  const service = await createServiceWithFiles([])
  const localPath = join(getFilesStoragePath(), 'cross-device.txt')
  writeFileSync(localPath, '同步下来的内容')
  await service.applySyncedFilesMetadata([
    createSyncedFileItem({
      id: 'file-cross',
      filePath: 'cross-device.txt',
      absolutePath: '/Users/other-machine/.lumina/knowledge/data/files/cross-device.txt'
    })
  ])
  try {
    const result = await service.applySyncedFileDeletion('file-cross')
    assert.equal(result.success, true)
    // 归一化后包含性检查通过，物理删除生效
    assert.equal(existsSync(localPath), false)
    assert.equal(service.getFileById('file-cross'), null)
  } finally {
    rmSync(localPath, { force: true })
    resetKnowledgeStorage()
  }
})

test('归一化后 filePath 注入仍被拦截：applySyncedFileContent/Deletion 不触及目录外', async () => {
  // filePath '../../escaped-del.txt' 归一化后解析到 knowledge 目录（存储目录外）
  const escapeTarget = join(getKnowledgeDirPath(), 'escaped-del.txt')
  const service = await createServiceWithFiles([])
  await service.applySyncedFilesMetadata([
    createSyncedFileItem({ id: 'evil-sync', filePath: '../../escaped-del.txt' })
  ])
  writeFileSync(escapeTarget, '目录外重要数据')
  try {
    const write = await service.applySyncedFileContent('evil-sync', new Uint8Array([1, 2, 3]))
    assert.equal(write.success, false)
    assert.match(write.error || '', /非法文件路径/)

    const del = await service.applySyncedFileDeletion('evil-sync')
    assert.equal(del.success, true)
    // 目录外文件不被物理删除，metadata 正常移除
    assert.equal(existsSync(escapeTarget), true)
    assert.equal(service.getFileById('evil-sync'), null)
  } finally {
    rmSync(escapeTarget, { force: true })
    resetKnowledgeStorage()
  }
})
