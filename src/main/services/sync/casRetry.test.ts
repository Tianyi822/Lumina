/**
 * casPutWithMerge 单测：覆盖成功一次、单次 stale 后合并成功、持续 stale 耗尽、
 * 非 stale 错误透传、onConflict 失败记 error、currentVersion=0 按创建处理。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import type { SyncResult } from '@shared/types/sync'
import { casPutWithMerge } from './casRetry'

/** 构造一个可控的 putFn：按调用序列返回预设 Result */
function makePutFn(
  sequence: SyncResult<{ version: number }>[],
  record?: { received: Array<{ base: number }> }
): (bytes: Uint8Array, base: number) => Promise<SyncResult<{ version: number }>> {
  let i = 0
  return async (_bytes, base) => {
    record?.received.push({ base })
    return sequence[i++] ?? { success: true, data: { version: 999 } }
  }
}

const ok = (version: number): SyncResult<{ version: number }> => ({
  success: true,
  data: { version }
})
const stale = (): SyncResult<{ version: number }> => ({
  success: false,
  code: 'stale_session_file',
  error: '版本冲突'
})
const alwaysStale = (): SyncResult<{ version: number }> => ({
  success: false,
  code: 'stale_manifest',
  error: 'manifest 版本冲突'
})

test('CAS: 首次 PUT 成功 → 直接返回 version，不调 onConflict', async () => {
  let conflictCalled = 0
  const result = await casPutWithMerge({
    initialBytes: new Uint8Array([1]),
    initialBase: 0,
    putFn: makePutFn([ok(3)]),
    onConflict: async () => {
      conflictCalled++
      return { resolved: 'rebased', bytes: new Uint8Array([1]), nextBase: 1 }
    }
  })
  assert.deepEqual(result, { ok: true, version: 3, via: 'put' })
  assert.equal(conflictCalled, 0)
})

test('CAS: 单次 stale 后 onConflict 合并 → 第二次 PUT 成功', async () => {
  const received: Array<{ base: number }> = []
  const result = await casPutWithMerge({
    initialBytes: new Uint8Array([1]),
    initialBase: 0,
    putFn: makePutFn([stale(), ok(5)], { received }),
    onConflict: async () => ({
      resolved: 'rebased',
      bytes: new Uint8Array([2, 3]),
      nextBase: 2
    })
  })
  assert.deepEqual(result, { ok: true, version: 5, via: 'put' })
  // 第一次 base=0（initial），冲突后第二次 base=2（onConflict 返回的 nextBase）
  assert.deepEqual(received, [{ base: 0 }, { base: 2 }])
})

test('CAS: onConflict 返回 resolved（远端胜转下行）→ 直接成功结束，不再 PUT', async () => {
  let putCalls = 0
  const result = await casPutWithMerge({
    initialBytes: new Uint8Array([1]),
    initialBase: 0,
    putFn: async () => {
      putCalls++
      return stale()
    },
    onConflict: async () => ({ resolved: 'resolved', resolvedVersion: 7 })
  })
  assert.deepEqual(result, { ok: true, version: 7, via: 'resolved' })
  assert.equal(putCalls, 1) // 只 PUT 一次（stale 后由 resolved 终止，不第二次 PUT）
})

test('CAS: 持续 stale 至重试耗尽 → {ok:false, unknown_error, 重试耗尽}', async () => {
  const result = await casPutWithMerge({
    initialBytes: new Uint8Array([1]),
    initialBase: 0,
    putFn: makePutFn([stale(), stale(), stale()]),
    onConflict: async () => ({ resolved: 'rebased', bytes: new Uint8Array([1]), nextBase: 1 })
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, 'unknown_error')
    assert.match(result.error, /重试耗尽/)
  }
})

test('CAS: 非 stale 错误（如 body_too_large）→ 立即透传 code+error，不重试', async () => {
  let conflictCalled = 0
  const tooLarge: SyncResult<{ version: number }> = {
    success: false,
    code: 'body_too_large',
    error: '密文超过上限'
  }
  const result = await casPutWithMerge({
    initialBytes: new Uint8Array([1]),
    initialBase: 0,
    putFn: makePutFn([tooLarge]),
    onConflict: async () => {
      conflictCalled++
      return { resolved: 'rebased', bytes: new Uint8Array([1]), nextBase: 1 }
    }
  })
  assert.deepEqual(result, { ok: false, code: 'body_too_large', error: '密文超过上限' })
  assert.equal(conflictCalled, 0)
})

test('CAS: onConflict 返回失败 → 记 error 返回，不再重试', async () => {
  const result = await casPutWithMerge({
    initialBytes: new Uint8Array([1]),
    initialBase: 0,
    putFn: makePutFn([stale(), ok(9)]),
    onConflict: async () => ({ resolved: 'failed', error: '解密失败' })
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.code, 'unknown_error')
    assert.equal(result.error, '解密失败')
  }
})

test('CAS: currentVersion=0 表示行不存在，onConflict 返回 nextBase=0 按创建处理', async () => {
  // 场景：冲突时远端版本被清零（行不存在），onConflict 回报 nextBase=0，
  // 下次 PUT 以 base=0 创建新行，服务端返回 version=1
  const received: Array<{ base: number }> = []
  const result = await casPutWithMerge({
    initialBytes: new Uint8Array([1]),
    initialBase: 5,
    putFn: makePutFn([stale(), ok(1)], { received }),
    onConflict: async () => ({ resolved: 'rebased', bytes: new Uint8Array([1]), nextBase: 0 })
  })
  assert.deepEqual(result, { ok: true, version: 1, via: 'put' })
  assert.deepEqual(received, [{ base: 5 }, { base: 0 }])
})

test('CAS: stale_manifest 码同样被识别为冲突（config/pack 兼容）', async () => {
  const result = await casPutWithMerge({
    initialBytes: new Uint8Array([1]),
    initialBase: 0,
    putFn: makePutFn([alwaysStale(), ok(2)]),
    onConflict: async () => ({ resolved: 'rebased', bytes: new Uint8Array([1]), nextBase: 1 })
  })
  assert.deepEqual(result, { ok: true, version: 2, via: 'put' })
})

test('CAS: 自定义 retryLimit=0 → 单次 stale 即耗尽，不调 onConflict', async () => {
  let conflictCalled = 0
  const result = await casPutWithMerge({
    initialBytes: new Uint8Array([1]),
    initialBase: 0,
    retryLimit: 0,
    putFn: makePutFn([stale()]),
    onConflict: async () => {
      conflictCalled++
      return { resolved: 'rebased', bytes: new Uint8Array([1]), nextBase: 1 }
    }
  })
  assert.equal(result.ok, false)
  assert.equal(conflictCalled, 0)
})
