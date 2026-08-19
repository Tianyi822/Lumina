import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { UnifiedToolExecutor } from './UnifiedToolExecutor'
import type { ToolCallDefinition, UnifiedToolExecutorOptions } from './UnifiedToolExecutor'
import type { RegisteredTool, ToolAdapter } from './UnifiedToolRegistry'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolCategory } from '@shared/types/tool-stats'
import type { Logger } from '../../logger'

// ===== 类型别名 =====

type FakeWebContents = Parameters<UnifiedToolExecutor['executeToolCalls']>[1]
type ExecutorOptions = ConstructorParameters<typeof UnifiedToolExecutor>[0]

// ===== Fake 依赖 =====

const fakeWebContents = {} as unknown as FakeWebContents

/** 最小 Logger mock：所有方法均为空操作 */
function createFakeLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  } as unknown as Logger
}

/** 可记录每次执行的 adapter，用于断言"是否真正执行" */
function createRecordingAdapter(): {
  adapter: ToolAdapter
  calls: { name: string; args: Record<string, unknown> }[]
} {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const adapter: ToolAdapter = {
    getTools: async () => [],
    execute: async (name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> => {
      calls.push({ name, args })
      return { success: true, content: `executed:${name}` }
    }
  }
  return { adapter, calls }
}

/** 构建一个注册了若干工具的 registry（通过直接构造 RegisteredTool 注入） */
function createRegistryWithTools(
  toolNames: string[],
  adapter: ToolAdapter
): ExecutorOptions['registry'] {
  const tools = new Map<string, RegisteredTool>()
  for (const fullName of toolNames) {
    const category: ToolCategory = fullName.startsWith('paper__')
      ? 'paper'
      : fullName.startsWith('knowledge__')
        ? 'knowledge'
        : 'mcp'
    tools.set(fullName, {
      fullName,
      category,
      serverName: fullName.split('__')[0],
      functionDef: { name: fullName.split('__')[1] ?? fullName, description: '', parameters: {} },
      adapter,
      registeredAt: new Date(),
      status: 'available',
      timeoutMs: 60000
    })
  }
  // registry 只用到 getTool，构造最小实现
  return {
    getTool(name: string) {
      return tools.get(name)
    }
  } as unknown as ExecutorOptions['registry']
}

function makeToolCall(
  id: string,
  name: string,
  args: Record<string, unknown> = {}
): ToolCallDefinition {
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) }
  }
}

function createExecutor(
  registry: ExecutorOptions['registry'],
  adapterCalls: { name: string; args: Record<string, unknown> }[],
  streamEvents: import('@shared/types/chat').StreamEvent[] = []
): UnifiedToolExecutor {
  // 共享 recording adapter：每次真实执行会推入 adapterCalls
  const options: UnifiedToolExecutorOptions = {
    logger: createFakeLogger(),
    registry,
    checkStopped: () => {},
    withTimeoutAndStopCheck: async <T>(promise: Promise<T>): Promise<T> => promise,
    sendStreamEvent: (_wc, event) => {
      streamEvents.push(event)
    },
    pendingUserInteraction: new Set<string>()
  }
  // 通过 adapterCalls 引用捕获执行次数（adapter 在 createRegistryWithTools 内部已注入）
  void adapterCalls
  return new UnifiedToolExecutor(options)
}

// 为单次 executor 提供共享 recording adapter + registry 的工厂
function createExecutorWithTools(toolNames: string[]): {
  executor: UnifiedToolExecutor
  adapterCalls: { name: string; args: Record<string, unknown> }[]
  streamEvents: import('@shared/types/chat').StreamEvent[]
} {
  const { adapter, calls } = createRecordingAdapter()
  const registry = createRegistryWithTools(toolNames, adapter)
  const streamEvents: import('@shared/types/chat').StreamEvent[] = []
  const executor = createExecutor(registry, calls, streamEvents)
  return { executor, adapterCalls: calls, streamEvents }
}

// ===== 测试 =====

describe('UnifiedToolExecutor 连续重复调用检测', () => {
  let sessionId: string

  beforeEach(() => {
    sessionId = `s-${Math.random().toString(36).slice(2)}`
  })

  it('首次至第 3 次连续相同参数调用应正常执行', async () => {
    const { executor, adapterCalls } = createExecutorWithTools(['paper__search_context'])

    for (let i = 0; i < 3; i++) {
      const summary = await executor.executeToolCalls(
        [makeToolCall(`c${i}`, 'paper__search_context', { path: '/tmp/a' })],
        fakeWebContents,
        sessionId,
        []
      )
      assert.equal(summary.results.length, 1)
      assert.equal(summary.results[0].success, true, `第 ${i + 1} 次应成功`)
    }
    assert.equal(adapterCalls.length, 3, '应真正执行 3 次')
  })

  it('第 4 次连续相同参数调用应被拦截并返回 [duplicate] 错误', async () => {
    const { executor, adapterCalls } = createExecutorWithTools(['paper__search_context'])

    // 第 1-3 次正常
    for (let i = 0; i < 3; i++) {
      await executor.executeToolCalls(
        [makeToolCall(`c${i}`, 'paper__search_context', { path: '/tmp/b' })],
        fakeWebContents,
        sessionId,
        []
      )
    }
    // 第 4 次拦截
    const summary = await executor.executeToolCalls(
      [makeToolCall('c3', 'paper__search_context', { path: '/tmp/b' })],
      fakeWebContents,
      sessionId,
      []
    )

    assert.equal(summary.results.length, 1)
    const result = summary.results[0]
    assert.equal(result.success, false)
    assert.ok(result.error, '应有 error')
    assert.match(result.error!, /\[duplicate\]/, 'error 应含 [duplicate] 前缀')
    assert.equal(adapterCalls.length, 3, '第 4 次不应真正执行')
  })

  it('被拦截的调用应先发送 tool_call 再发送 tool_result（保持 1:1 配对）', async () => {
    const { executor, streamEvents } = createExecutorWithTools(['paper__search_context'])

    // 第 1-3 次正常
    for (let i = 0; i < 3; i++) {
      await executor.executeToolCalls(
        [makeToolCall(`p${i}`, 'paper__search_context', { path: '/tmp/p' })],
        fakeWebContents,
        sessionId,
        []
      )
    }
    // 清空之前累积的事件，只观察第 4 次（拦截）这一轮
    streamEvents.length = 0

    // 第 4 次拦截
    await executor.executeToolCalls(
      [makeToolCall('p3', 'paper__search_context', { path: '/tmp/p' })],
      fakeWebContents,
      sessionId,
      []
    )

    // 拦截路径应成对发送：先 tool_call，再 tool_result
    assert.equal(streamEvents.length, 2, '拦截路径应恰好发送 2 个事件')
    assert.equal(streamEvents[0].type, 'tool_call', '第一个事件应为 tool_call')
    assert.equal(streamEvents[1].type, 'tool_result', '第二个事件应为 tool_result')
    // ID 应一致，构成完整配对
    assert.equal(streamEvents[0].toolCall?.id, 'p3', 'tool_call 事件应携带被拦截调用的 id')
    assert.equal(
      streamEvents[0].toolCall?.name,
      'search_context',
      'tool_call 事件应携带注册表中的短名'
    )
    assert.deepEqual(
      streamEvents[0].toolCall?.arguments,
      { path: '/tmp/p' },
      'tool_call 事件应携带解析后的参数'
    )
    assert.equal(streamEvents[1].toolResult?.id, 'p3', 'tool_result 事件应与 tool_call 的 id 匹配')
    assert.equal(streamEvents[1].toolResult?.success, false, 'tool_result 应标记为失败')
  })

  it('不同参数不算重复（同工具）', async () => {
    const { executor, adapterCalls } = createExecutorWithTools(['paper__search_context'])

    const paths = ['/tmp/x', '/tmp/y', '/tmp/z', '/tmp/w']
    for (let i = 0; i < paths.length; i++) {
      const summary = await executor.executeToolCalls(
        [makeToolCall(`c${i}`, 'paper__search_context', { path: paths[i] })],
        fakeWebContents,
        sessionId,
        []
      )
      assert.equal(summary.results[0].success, true, `path=${paths[i]} 应成功`)
    }
    assert.equal(adapterCalls.length, 4, '四次不同参数都应执行')
  })

  it('不同工具相同参数不算重复', async () => {
    const { executor, adapterCalls } = createExecutorWithTools([
      'paper__search_context',
      'paper__read_metadata'
    ])

    // 交替调用两个工具，参数相同
    for (let i = 0; i < 6; i++) {
      const name = i % 2 === 0 ? 'paper__search_context' : 'paper__read_metadata'
      const summary = await executor.executeToolCalls(
        [makeToolCall(`c${i}`, name, { path: '/tmp/same' })],
        fakeWebContents,
        sessionId,
        []
      )
      assert.equal(summary.results[0].success, true, `第 ${i + 1} 次应成功`)
    }
    assert.equal(adapterCalls.length, 6, '穿插不同工具不应拦截')
  })

  it('被其他工具穿插后连续计数应重置（A→A→A→B→A，最后一次 A 不拦截）', async () => {
    const { executor, adapterCalls } = createExecutorWithTools([
      'paper__search_context',
      'paper__read_metadata'
    ])

    // A x3
    for (let i = 0; i < 3; i++) {
      await executor.executeToolCalls(
        [makeToolCall(`a${i}`, 'paper__search_context', { path: '/tmp/r' })],
        fakeWebContents,
        sessionId,
        []
      )
    }
    // B 打断
    await executor.executeToolCalls(
      [makeToolCall('b0', 'paper__read_metadata', { path: '/tmp/r' })],
      fakeWebContents,
      sessionId,
      []
    )
    // A 再次：应作为新的连续序列第 1 次，正常执行
    const summary = await executor.executeToolCalls(
      [makeToolCall('a4', 'paper__search_context', { path: '/tmp/r' })],
      fakeWebContents,
      sessionId,
      []
    )

    assert.equal(summary.results[0].success, true, '被打断后 A 应重新计数')
    assert.equal(adapterCalls.length, 5, '5 次都应真正执行')
  })

  it('白名单工具（knowledge__search / paper__read_page）连续重复调用不应被拦截', async () => {
    const { executor, adapterCalls } = createExecutorWithTools([
      'knowledge__search',
      'paper__read_page'
    ])

    // knowledge__search 连续 6 次相同参数
    for (let i = 0; i < 6; i++) {
      const summary = await executor.executeToolCalls(
        [makeToolCall(`s${i}`, 'knowledge__search', {})],
        fakeWebContents,
        sessionId,
        []
      )
      assert.equal(summary.results[0].success, true, `knowledge__search 第 ${i + 1} 次应成功`)
    }
    // paper__read_page 连续 6 次
    for (let i = 0; i < 6; i++) {
      const summary = await executor.executeToolCalls(
        [makeToolCall(`l${i}`, 'paper__read_page', { dir: '/tmp' })],
        fakeWebContents,
        sessionId,
        []
      )
      assert.equal(summary.results[0].success, true, `paper__read_page 第 ${i + 1} 次应成功`)
    }
    assert.equal(adapterCalls.length, 12, '白名单工具全部执行')
  })

  it('路径格式差异（尾斜杠、大小写、首尾空格）应被视为相同调用', async () => {
    const { executor, adapterCalls } = createExecutorWithTools(['paper__search_context'])

    // 前三次形式不同但语义等价
    const variants = ['/tmp/a', '/tmp/a/', '  /TMP/A  ']
    for (let i = 0; i < 3; i++) {
      const summary = await executor.executeToolCalls(
        [makeToolCall(`v${i}`, 'paper__search_context', { path: variants[i] })],
        fakeWebContents,
        sessionId,
        []
      )
      assert.equal(summary.results[0].success, true)
    }
    // 第 4 个等价变体应被拦截
    const summary = await executor.executeToolCalls(
      [makeToolCall('v3', 'paper__search_context', { path: '/tmp/a/' })],
      fakeWebContents,
      sessionId,
      []
    )
    assert.equal(summary.results[0].success, false)
    assert.match(summary.results[0].error!, /\[duplicate\]/)
    assert.equal(adapterCalls.length, 3)
  })

  it('对象参数 key 顺序不同应被视为相同调用', async () => {
    const { executor, adapterCalls } = createExecutorWithTools(['knowledge__list'])

    const orderedA = { path: '/tmp/f', content: 'x', mode: 644 }
    const orderedB = { mode: 644, content: 'x', path: '/tmp/f' }
    const orderedC = { content: 'x', path: '/tmp/f', mode: 644 }

    for (let i = 0; i < 3; i++) {
      const args = [orderedA, orderedB, orderedC][i]
      const summary = await executor.executeToolCalls(
        [makeToolCall(`o${i}`, 'knowledge__list', args as Record<string, unknown>)],
        fakeWebContents,
        sessionId,
        []
      )
      assert.equal(summary.results[0].success, true)
    }
    // 第 4 次任意顺序都应拦截
    const summary = await executor.executeToolCalls(
      [makeToolCall('o3', 'knowledge__list', orderedB)],
      fakeWebContents,
      sessionId,
      []
    )
    assert.equal(summary.results[0].success, false)
    assert.match(summary.results[0].error!, /\[duplicate\]/)
    assert.equal(adapterCalls.length, 3)
  })

  it('不同 sessionId 互不影响', async () => {
    const { executor, adapterCalls } = createExecutorWithTools(['paper__search_context'])

    const otherSession = 's-other'
    // 主 session 调 3 次
    for (let i = 0; i < 3; i++) {
      await executor.executeToolCalls(
        [makeToolCall(`m${i}`, 'paper__search_context', { path: '/tmp/q' })],
        fakeWebContents,
        sessionId,
        []
      )
    }
    // 另一 session 同参数 4 次，不应被主 session 影响
    for (let i = 0; i < 4; i++) {
      const summary = await executor.executeToolCalls(
        [makeToolCall(`o${i}`, 'paper__search_context', { path: '/tmp/q' })],
        fakeWebContents,
        otherSession,
        []
      )
      // otherSession 第 4 次在本 session 内被拦截，但不影响主 session 之前的 3 次
      if (i < 3) {
        assert.equal(summary.results[0].success, true, `other 第 ${i + 1} 次应成功`)
      }
    }
    assert.ok(adapterCalls.length >= 6, '两 session 独立计数')
  })
})
