import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SessionStorageService } from './SessionStorageService'
import type { SessionData, SessionMessage } from '@shared/types/session'

/** 创建独立临时根目录 */
function createTempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'lumina-session-test-'))
}

/** 构造合法 sessionId（符合 session-{timestamp}-{random} 模式） */
function makeSessionId(suffix: string): string {
  return `session-1722240000000-${suffix}`
}

/** 构造最小合法会话 */
function makeSession(idSuffix: string, messageCount = 0): SessionData {
  const now = '2026-07-29T00:00:00.000Z'
  const messages: SessionMessage[] = []
  for (let i = 0; i < messageCount; i++) {
    messages.push(makeMessage(`msg-${i}`))
  }
  return {
    sessionId: makeSessionId(idSuffix),
    title: '测试会话',
    sessionType: 'default',
    createdAt: now,
    updatedAt: now,
    messages
  }
}

/** 构造最小合法消息 */
function makeMessage(id: string): SessionMessage {
  return { id, role: 'user', content: `内容-${id}`, timestamp: '2026-07-29T00:00:00.000Z' }
}

/** 读取 JSONL 文件的非空行 */
function readLines(root: string, sessionId: string): string[] {
  return readFileSync(join(root, `${sessionId}.jsonl`), 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
}

test('SessionStorageService', async (t) => {
  await t.test('rewrite → load 往返', async () => {
    const root = createTempRoot()
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    const session = makeSession('aaa001', 2)
    await storage.rewriteSession(session)
    const loaded = await storage.loadSession(session.sessionId)
    assert.deepEqual(loaded, session)
    const lines = readLines(root, session.sessionId)
    assert.equal(lines.length, 3) // 1 meta + 2 message
    assert.equal(JSON.parse(lines[0]).kind, 'meta')
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('appendMessages 追加消息且不重写既有行', async () => {
    const root = createTempRoot()
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    const session = makeSession('aaa002', 1)
    await storage.rewriteSession(session)
    const ok = await storage.appendMessages(session.sessionId, [makeMessage('msg-new')])
    assert.equal(ok, true)
    const loaded = await storage.loadSession(session.sessionId)
    assert.equal(loaded?.messages.length, 2)
    assert.equal(loaded?.messages[1].id, 'msg-new')
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('appendMessages 目标不存在返回 false', async () => {
    const root = createTempRoot()
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    const ok = await storage.appendMessages(makeSessionId('nope01'), [makeMessage('m')])
    assert.equal(ok, false)
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('appendMeta 追加 meta 行且最后一条生效', async () => {
    const root = createTempRoot()
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    const session = makeSession('aaa003', 1)
    await storage.rewriteSession(session)
    const ok = await storage.appendMeta(session.sessionId, { title: '新标题' })
    assert.equal(ok, true)
    const lines = readLines(root, session.sessionId)
    // 1 原 meta + 1 message + 1 新 meta
    assert.equal(lines.length, 3)
    const loaded = await storage.loadSession(session.sessionId)
    assert.equal(loaded?.title, '新标题')
    assert.equal(loaded?.messages.length, 1)
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('meta 行超阈值触发 compaction', async () => {
    const root = createTempRoot()
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    const session = makeSession('aaa004', 3)
    await storage.rewriteSession(session)
    // 初始 1 条 meta，第 20 次追加时越过阈值（20）触发压实
    for (let i = 0; i < 20; i++) {
      await storage.appendMeta(session.sessionId, { title: `标题-${i}` })
    }
    const lines = readLines(root, session.sessionId)
    const metaCount = lines.filter((line) => JSON.parse(line).kind === 'meta').length
    assert.equal(metaCount, 1) // 已压实为单条 meta
    const loaded = await storage.loadSession(session.sessionId)
    assert.equal(loaded?.title, '标题-19')
    assert.equal(loaded?.messages.length, 3)
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('残缺尾行被跳过，不丢弃整个会话', async () => {
    const root = createTempRoot()
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    const session = makeSession('aaa005', 2)
    await storage.rewriteSession(session)
    // 模拟追加中途崩溃产生的半行
    const filePath = join(root, `${session.sessionId}.jsonl`)
    writeFileSync(filePath, readFileSync(filePath, 'utf-8') + '{"kind":"mess', 'utf-8')
    const loaded = await storage.loadSession(session.sessionId)
    assert.equal(loaded?.messages.length, 2)
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('initialize 恢复孤儿 tmp 文件', async () => {
    const root = createTempRoot()
    const sessionId = makeSessionId('aaa006')
    const metaLine = JSON.stringify({
      kind: 'meta',
      v: 1,
      data: {
        sessionId,
        title: '恢复',
        sessionType: 'default',
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z'
      }
    })
    writeFileSync(join(root, `${sessionId}.jsonl.tmp`), metaLine + '\n', 'utf-8')
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    assert.equal(existsSync(join(root, `${sessionId}.jsonl`)), true)
    assert.equal(existsSync(join(root, `${sessionId}.jsonl.tmp`)), false)
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('listSessions 读 index，index 缺失时重建', async () => {
    const root = createTempRoot()
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    await storage.rewriteSession(makeSession('aaa007'))
    await storage.rewriteSession({ ...makeSession('aaa008'), createdAt: '2026-07-30T00:00:00.000Z' })
    let list = await storage.listSessions()
    assert.equal(list.length, 2)
    assert.equal(list[0].sessionId, makeSessionId('aaa008')) // createdAt 倒序
    // 删除 index 后应能从 jsonl 重建
    rmSync(join(root, 'index.json'))
    list = await storage.listSessions()
    assert.equal(list.length, 2)
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('deleteSession 删除文件并移出 index', async () => {
    const root = createTempRoot()
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    const session = makeSession('aaa009')
    await storage.rewriteSession(session)
    const ok = await storage.deleteSession(session.sessionId)
    assert.equal(ok, true)
    assert.equal(existsSync(join(root, `${session.sessionId}.jsonl`)), false)
    assert.equal((await storage.listSessions()).length, 0)
    assert.equal(await storage.deleteSession(session.sessionId), false)
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('迁移：旧 JSON 转换为 JSONL 并删除原文件', async () => {
    const root = createTempRoot()
    const legacy = makeSession('aaa010', 2)
    writeFileSync(
      join(root, `${legacy.sessionId}-测试会话.json`),
      JSON.stringify(legacy, null, 2),
      'utf-8'
    )
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    assert.equal(existsSync(join(root, `${legacy.sessionId}-测试会话.json`)), false)
    const loaded = await storage.loadSession(legacy.sessionId)
    assert.deepEqual(loaded, legacy)
    const list = await storage.listSessions()
    assert.equal(list.length, 1)
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('迁移：损坏的旧 JSON 原样保留', async () => {
    const root = createTempRoot()
    const badPath = join(root, 'session-1722240000000-bad001-坏文件.json')
    writeFileSync(badPath, '{ 这不是合法 JSON', 'utf-8')
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    assert.equal(existsSync(badPath), true)
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('迁移幂等：jsonl 已存在时旧文件改名 .migrated', async () => {
    const root = createTempRoot()
    const session = makeSession('aaa011', 1)
    const legacyPath = join(root, `${session.sessionId}-测试会话.json`)
    writeFileSync(legacyPath, JSON.stringify(session), 'utf-8')
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    // 第一次迁移完成后，再放一个同 ID 旧文件并重新初始化
    writeFileSync(legacyPath, JSON.stringify({ ...session, title: '旧数据' }), 'utf-8')
    const storage2 = new SessionStorageService(() => root)
    await storage2.initialize()
    assert.equal(existsSync(legacyPath), false)
    assert.equal(existsSync(`${legacyPath}.migrated`), true)
    // jsonl 中的数据未被旧文件覆盖
    const loaded = await storage2.loadSession(session.sessionId)
    assert.equal(loaded?.title, '测试会话')
    rmSync(root, { recursive: true, force: true })
  })

  await t.test('并发追加串行化，行行可解析', async () => {
    const root = createTempRoot()
    const storage = new SessionStorageService(() => root)
    await storage.initialize()
    const session = makeSession('aaa012')
    await storage.rewriteSession(session)
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        storage.appendMessages(session.sessionId, [makeMessage(`并发-${i}`)])
      )
    )
    const lines = readLines(root, session.sessionId)
    assert.equal(lines.length, 11) // 1 meta + 10 message
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line))
    }
    const loaded = await storage.loadSession(session.sessionId)
    assert.equal(loaded?.messages.length, 10)
    rmSync(root, { recursive: true, force: true })
  })
})
