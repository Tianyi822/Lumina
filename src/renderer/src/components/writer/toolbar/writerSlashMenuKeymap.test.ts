import assert from 'node:assert/strict'
import test from 'node:test'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  closeWriterSlashMenuGate,
  createWriterSlashMenuKeyPlugin,
  prependWriterSlashMenuPlugin,
  resolveWriterSlashMenuVisibility
} from './writerSlashMenuKeymap'

function keyboardEvent(key: string): KeyboardEvent {
  return { key } as KeyboardEvent
}

test('高优先级 Enter 先选择菜单项而不触发编辑器默认换行', () => {
  let selectedItem = -1
  let splitBlock = false
  const slashPlugin = createWriterSlashMenuKeyPlugin({
    getSnapshot: () => ({ open: true, itemCount: 3, selectedIndex: 1 }),
    moveSelection: () => {},
    selectItem: (index) => {
      selectedItem = index
    },
    closeMenu: () => {}
  })
  const defaultKeymap = new Plugin({
    props: {
      handleKeyDown: () => {
        splitBlock = true
        return true
      }
    }
  })

  for (const plugin of prependWriterSlashMenuPlugin(slashPlugin, [defaultKeymap])) {
    if (plugin.props.handleKeyDown?.call(plugin, {} as EditorView, keyboardEvent('Enter'))) {
      break
    }
  }

  assert.equal(selectedItem, 1)
  assert.equal(splitBlock, false)
})

test('上下方向键循环菜单选区', () => {
  const movedTo: number[] = []
  let selectedIndex = 0
  const plugin = createWriterSlashMenuKeyPlugin({
    getSnapshot: () => ({ open: true, itemCount: 3, selectedIndex }),
    moveSelection: (index) => {
      selectedIndex = index
      movedTo.push(index)
    },
    selectItem: () => {},
    closeMenu: () => {}
  })

  assert.equal(
    plugin.props.handleKeyDown?.call(plugin, {} as EditorView, keyboardEvent('ArrowUp')),
    true
  )
  assert.equal(
    plugin.props.handleKeyDown?.call(plugin, {} as EditorView, keyboardEvent('ArrowDown')),
    true
  )
  assert.deepEqual(movedTo, [2, 0])
})

test('Escape 关闭后 focus transaction 不会从残留查询重开', () => {
  let gate = { suppressed: false }
  const plugin = createWriterSlashMenuKeyPlugin({
    getSnapshot: () => ({ open: true, itemCount: 3, selectedIndex: 0 }),
    moveSelection: () => {},
    selectItem: () => {},
    closeMenu: () => {
      gate = closeWriterSlashMenuGate()
    }
  })

  assert.equal(
    plugin.props.handleKeyDown?.call(plugin, {} as EditorView, keyboardEvent('Escape')),
    true
  )
  const afterFocus = resolveWriterSlashMenuVisibility({
    hasCandidate: true,
    focused: true,
    gate
  })
  assert.deepEqual(afterFocus, { visible: false, gate: { suppressed: true } })

  const afterTriggerRemoved = resolveWriterSlashMenuVisibility({
    hasCandidate: false,
    focused: true,
    gate: afterFocus.gate
  })
  assert.deepEqual(afterTriggerRemoved, { visible: false, gate: { suppressed: false } })
})

test('编辑器失焦时不显示 Slash Menu', () => {
  assert.deepEqual(
    resolveWriterSlashMenuVisibility({
      hasCandidate: true,
      focused: false,
      gate: { suppressed: false }
    }),
    { visible: false, gate: { suppressed: false } }
  )
})
