import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface WriterSlashMenuGate {
  suppressed: boolean
}

export interface WriterSlashMenuVisibilityInput {
  hasCandidate: boolean
  focused: boolean
  gate: WriterSlashMenuGate
}

export interface WriterSlashMenuVisibility {
  visible: boolean
  gate: WriterSlashMenuGate
}

export interface WriterSlashMenuKeySnapshot {
  open: boolean
  itemCount: number
  selectedIndex: number
}

export interface WriterSlashMenuKeyBindings {
  getSnapshot: () => WriterSlashMenuKeySnapshot
  moveSelection: (index: number) => void
  selectItem: (index: number) => void
  closeMenu: () => void
}

export const writerSlashMenuPluginKey = new PluginKey('writerSlashMenuKeys')

export function closeWriterSlashMenuGate(): WriterSlashMenuGate {
  return { suppressed: true }
}

export function resolveWriterSlashMenuVisibility(
  input: WriterSlashMenuVisibilityInput
): WriterSlashMenuVisibility {
  if (!input.hasCandidate) {
    return { visible: false, gate: { suppressed: false } }
  }
  return {
    visible: input.focused && !input.gate.suppressed,
    gate: input.gate
  }
}

export function createWriterSlashMenuKeyPlugin(bindings: WriterSlashMenuKeyBindings): Plugin {
  return new Plugin({
    key: writerSlashMenuPluginKey,
    props: {
      handleKeyDown: (_view, event) => {
        const snapshot = bindings.getSnapshot()
        if (!snapshot.open) return false

        if (event.key === 'Escape') {
          bindings.closeMenu()
          return true
        }

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          if (snapshot.itemCount === 0) return true
          const direction = event.key === 'ArrowDown' ? 1 : -1
          const nextIndex =
            (snapshot.selectedIndex + direction + snapshot.itemCount) % snapshot.itemCount
          bindings.moveSelection(nextIndex)
          return true
        }

        if (event.key === 'Enter' && snapshot.itemCount > 0) {
          bindings.selectItem(Math.min(snapshot.selectedIndex, snapshot.itemCount - 1))
          return true
        }

        return false
      }
    }
  })
}

export function prependWriterSlashMenuPlugin(newPlugin: Plugin, plugins: Plugin[]): Plugin[] {
  return [newPlugin, ...plugins]
}
