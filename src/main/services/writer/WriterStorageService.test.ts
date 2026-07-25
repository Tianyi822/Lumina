import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WriterStorageService } from './WriterStorageService'
import {
  getWriterDocumentDir,
  getWriterDocumentPath
} from './writerPaths'

function createService(t: test.TestContext, prefix: string): {
  rootPath: string
  service: WriterStorageService
} {
  const rootPath = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))
  return { rootPath, service: new WriterStorageService({ rootPath }) }
}

test('保存使用 expectedRevision 并拒绝旧修订覆盖', async (t) => {
  const { service } = createService(t, 'lumina-writer-storage-')
  await service.initialize()
  const created = (await service.createDocument()).data!
  const first = await service.saveDocument({
    documentId: created.id,
    expectedRevision: 0,
    title: '第一版',
    content: created.content
  })
  const conflict = await service.saveDocument({
    documentId: created.id,
    expectedRevision: 0,
    title: '旧请求',
    content: created.content
  })

  assert.equal(first.data?.revision, 1)
  assert.equal(conflict.code, 'revision_conflict')
  assert.equal((await service.getDocument(created.id)).data?.title, '第一版')
})

test('并发保存同一修订时只允许一个请求写入', async (t) => {
  const { service } = createService(t, 'lumina-writer-concurrent-save-')
  await service.initialize()
  const created = (await service.createDocument()).data!
  const [first, second] = await Promise.all([
    service.saveDocument({
      documentId: created.id,
      expectedRevision: 0,
      title: '请求一',
      content: created.content
    }),
    service.saveDocument({
      documentId: created.id,
      expectedRevision: 0,
      title: '请求二',
      content: created.content
    })
  ])

  assert.deepEqual(
    [first, second].map((result) => result.code ?? 'saved').sort(),
    ['revision_conflict', 'saved']
  )
  assert.equal((await service.getDocument(created.id)).data?.revision, 1)
})

test('初始化只恢复无正式文件的有效临时文档', async (t) => {
  const { rootPath, service } = createService(t, 'lumina-writer-recovery-')
  await service.initialize()
  const recovered = (await service.createDocument('恢复文档')).data!
  const finalDocumentPath = getWriterDocumentPath(recovered.id, rootPath)
  const temporaryDocumentPath = `${finalDocumentPath}.tmp`
  const temporaryDocument = { ...recovered, title: '临时覆盖', revision: 8 }
  writeFileSync(temporaryDocumentPath, JSON.stringify(temporaryDocument))

  const orphanId = 'writer-abcdefgh'
  const orphanPath = getWriterDocumentPath(orphanId, rootPath)
  const orphanDocument = {
    ...recovered,
    id: orphanId,
    title: '异常恢复',
    revision: 3
  }
  await import('node:fs/promises').then(({ mkdir }) => mkdir(getWriterDocumentDir(orphanId, rootPath)))
  writeFileSync(`${orphanPath}.tmp`, JSON.stringify(orphanDocument))

  const restarted = new WriterStorageService({ rootPath })
  await restarted.initialize()

  assert.equal((await restarted.getDocument(recovered.id)).data?.title, '恢复文档')
  assert.equal((await restarted.getDocument(orphanId)).data?.title, '异常恢复')
  assert.equal(existsSync(`${finalDocumentPath}.tmp`), false)
  assert.equal(existsSync(`${orphanPath}.tmp`), false)
})

test('初始化清理非法目录内的临时文档文件', async (t) => {
  const { rootPath, service } = createService(t, 'lumina-writer-invalid-temp-')
  await service.initialize()
  const temporaryPath = join(rootPath, 'documents', 'invalid-directory', 'document.json.tmp')
  mkdirSync(join(rootPath, 'documents', 'invalid-directory'), { recursive: true })
  writeFileSync(temporaryPath, '{无效临时文件')

  const restarted = new WriterStorageService({ rootPath })
  await restarted.initialize()

  assert.equal(existsSync(temporaryPath), false)
})

test('初始化恢复有效索引临时文件', async (t) => {
  const { rootPath, service } = createService(t, 'lumina-writer-index-recovery-')
  await service.initialize()
  const folder = (await service.createFolder('恢复资料')).data!
  const indexPath = join(rootPath, 'index.json')
  writeFileSync(`${indexPath}.tmp`, readFileSync(indexPath))
  rmSync(indexPath)

  const restarted = new WriterStorageService({ rootPath })
  const result = await restarted.initialize()

  assert.equal(result.data?.folders[0]?.id, folder.id)
  assert.equal(existsSync(`${indexPath}.tmp`), false)
})

test('索引损坏后从文档目录重建', async (t) => {
  const { rootPath, service } = createService(t, 'lumina-writer-index-')
  await service.initialize()
  const created = (await service.createDocument('可重建')).data!
  writeFileSync(join(rootPath, 'index.json'), '{损坏的 JSON')

  const restarted = new WriterStorageService({ rootPath })
  const result = await restarted.initialize()

  assert.equal(result.success, true)
  assert.deepEqual(result.data?.documents.map((document) => document.id), [created.id])
})

test('初始化将旧 Schema 文档迁移并写回磁盘', async (t) => {
  const { rootPath, service } = createService(t, 'lumina-writer-migration-')
  await service.initialize()
  const created = (await service.createDocument('旧文档')).data!
  const documentPath = getWriterDocumentPath(created.id, rootPath)
  writeFileSync(documentPath, JSON.stringify({ ...created, schemaVersion: 0 }))

  const restarted = new WriterStorageService({ rootPath })
  await restarted.initialize()

  const stored = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(documentPath, 'utf-8')))
  assert.equal(stored.schemaVersion, 1)
})

test('无效文档 ID 返回 invalid_input 且不访问目录', async (t) => {
  const { rootPath, service } = createService(t, 'lumina-writer-invalid-')
  await service.initialize()
  const result = await service.deleteDocument('../writer-abcdefgh')

  assert.equal(result.code, 'invalid_input')
  assert.equal(existsSync(join(rootPath, '..', 'writer-abcdefgh')), false)
})

test('目录与文档数据 ID 不一致时拒绝读取', async (t) => {
  const { rootPath, service } = createService(t, 'lumina-writer-id-mismatch-')
  await service.initialize()
  const first = (await service.createDocument('甲')).data!
  const second = (await service.createDocument('乙')).data!
  writeFileSync(getWriterDocumentPath(first.id, rootPath), JSON.stringify(second))

  const result = await service.getDocument(first.id)

  assert.equal(result.success, false)
  assert.equal(result.code, 'io_error')
})

test('运行时非字符串文档 ID 返回 invalid_input', async (t) => {
  const { service } = createService(t, 'lumina-writer-runtime-id-')
  await service.initialize()

  const result = await service.getDocument(Symbol('invalid') as unknown as string)

  assert.equal(result.success, false)
  assert.equal(result.code, 'invalid_input')
})

test('无效保存请求返回 invalid_input 而不抛出异常', async (t) => {
  const { service } = createService(t, 'lumina-writer-invalid-save-')
  await service.initialize()
  const document = (await service.createDocument()).data!
  const result = await service.saveDocument({
    documentId: document.id,
    expectedRevision: -1,
    title: '错误请求',
    content: { type: 'paragraph' }
  } as unknown as Parameters<WriterStorageService['saveDocument']>[0])

  assert.equal(result.success, false)
  assert.equal(result.code, 'invalid_input')
})

test('收藏文档排在未收藏文档之前', async (t) => {
  const { service } = createService(t, 'lumina-writer-favorite-')
  await service.initialize()
  const ordinary = (await service.createDocument('普通文档')).data!
  const favorite = (await service.createDocument('收藏文档')).data!
  await service.setFavorite(favorite.id, true)

  const index = await service.listDocuments()

  assert.deepEqual(index.data?.documents.map((document) => document.id), [favorite.id, ordinary.id])
})

test('最近打开文档最多保留 50 项并将最新文档置顶', async (t) => {
  const { service } = createService(t, 'lumina-writer-recent-')
  await service.initialize()
  const ids: string[] = []
  for (let index = 0; index < 51; index += 1) {
    ids.push((await service.createDocument(`文档 ${index}`)).data!.id)
  }
  for (const id of ids) {
    await service.getDocument(id)
  }

  const index = await service.listDocuments()

  assert.equal(index.data?.recentDocumentIds.length, 50)
  assert.equal(index.data?.recentDocumentIds[0], ids[50])
  assert.equal(index.data?.recentDocumentIds.includes(ids[0]), false)
})

test('删除文件夹只移动文档，永久删除文档移除整个目录', async (t) => {
  const { rootPath, service } = createService(t, 'lumina-writer-delete-')
  await service.initialize()
  const folder = (await service.createFolder('资料')).data!
  const document = (await service.createDocument('记录')).data!
  await service.moveDocument(document.id, folder.id)
  await service.deleteFolder(folder.id)

  assert.equal((await service.getDocument(document.id)).data?.folderId, undefined)
  await service.deleteDocument(document.id)
  assert.equal(existsSync(getWriterDocumentDir(document.id, rootPath)), false)
  assert.equal(existsSync(join(rootPath, 'trash')), false)
  assert.equal(existsSync(join(rootPath, 'revisions')), false)
  assert.equal(existsSync(join(rootPath, 'backups')), false)
})
