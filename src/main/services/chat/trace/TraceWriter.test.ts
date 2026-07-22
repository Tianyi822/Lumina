// src/main/services/chat/harness/trace/TraceWriter.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join, dirname } from 'node:path'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
  utimesSync,
  mkdirSync
} from 'node:fs'
import { tmpdir } from 'node:os'

import { TraceWriter, cleanupOldTraces } from './TraceWriter'
import type { TraceRecord } from './TraceSchema'

test('TraceWriter append-only 写入 jsonl', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trace-test-'))
  try {
    const writer = new TraceWriter({ rootDir: dir, sessionId: 's1', requestId: 'r1' })
    const rec1: TraceRecord = {
      ts: 1000,
      requestId: 'r1',
      sessionId: 's1',
      event: {
        event: 'run_started',
        requestId: 'r1',
        sessionId: 's1',
        sessionType: 'paper',
        engineKind: 'react'
      }
    }
    const rec2: TraceRecord = {
      ts: 2000,
      requestId: 'r1',
      sessionId: 's1',
      event: { event: 'route_decided', requestId: 'r1', engineKind: 'react', reason: 'test' }
    }
    writer.append(rec1)
    writer.append(rec2)
    await writer.flush()

    const filePath = join(dir, 's1', 'r1.jsonl')
    assert.equal(existsSync(filePath), true)
    const content = readFileSync(filePath, 'utf-8').trim().split('\n')
    assert.equal(content.length, 2)
    assert.equal(JSON.parse(content[0]).ts, 1000)
    assert.equal(JSON.parse(content[1]).event.event, 'route_decided')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('TraceWriter 多次 append 累加(不覆盖)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trace-test-'))
  try {
    const writer = new TraceWriter({ rootDir: dir, sessionId: 's1', requestId: 'r1' })
    writer.append({
      ts: 1,
      requestId: 'r1',
      sessionId: 's1',
      event: {
        event: 'run_started',
        requestId: 'r1',
        sessionId: 's1',
        sessionType: 'default',
        engineKind: 'react'
      }
    })
    await writer.flush()
    writer.append({
      ts: 2,
      requestId: 'r1',
      sessionId: 's1',
      event: { event: 'run_finished', requestId: 'r1', outcome: 'success', durationMs: 10 }
    })
    await writer.flush()

    const content = readFileSync(join(dir, 's1', 'r1.jsonl'), 'utf-8')
      .trim()
      .split('\n')
    assert.equal(content.length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cleanupOldTraces 删除超过 maxAgeDays 的文件', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'trace-test-'))
  try {
    // 写一个"旧"文件
    const oldFile = join(dir, 'old-session', 'old-req.jsonl')
    mkdirSync(dirname(oldFile), { recursive: true })
    writeFileSync(oldFile, '{"ts":1}\n')
    // 把修改时间设为 10 天前
    const tenDaysAgo = Date.now() / 1000 - 10 * 24 * 60 * 60
    utimesSync(oldFile, tenDaysAgo, tenDaysAgo)

    // 写一个"新"文件
    const newFile = join(dir, 'new-session', 'new-req.jsonl')
    mkdirSync(dirname(newFile), { recursive: true })
    writeFileSync(newFile, '{"ts":2}\n')

    const deleted = await cleanupOldTraces(dir, 7)
    assert.equal(existsSync(oldFile), false)
    assert.equal(existsSync(newFile), true)
    assert.ok(deleted >= 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
