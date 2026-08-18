import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import styles from './WriterTableControls.module.css'

interface WriterTableControlsProps {
  editor: Editor
}

type WriterTableAlign = 'left' | 'center' | 'right'

interface AlignOption {
  value: WriterTableAlign
  label: string
}

/** 表格节点工具：只提供新增/删除行列、切换表头与基础对齐，不提供合并/拆分单元格。 */
export default function WriterTableControls({ editor }: WriterTableControlsProps) {
  const { t } = useTranslation()
  const alignOptions: AlignOption[] = [
    { value: 'left', label: t('writer.nodes.alignLeft') },
    { value: 'center', label: t('writer.nodes.alignCenter') },
    { value: 'right', label: t('writer.nodes.alignRight') }
  ]

  const preventFocusLoss = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="writerTableControls"
      shouldShow={({ editor: currentEditor }) =>
        currentEditor.isEditable && currentEditor.isActive('table')
      }
      options={{ placement: 'top', offset: 8 }}
      className={styles.tableControls}
      role="toolbar"
      aria-label={t('writer.nodes.tableTools')}
    >
      <button
        type="button"
        className={styles.button}
        onMouseDown={preventFocusLoss}
        disabled={!editor.can().addRowAfter()}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        {t('writer.nodes.addRow')}
      </button>
      <button
        type="button"
        className={styles.button}
        onMouseDown={preventFocusLoss}
        disabled={!editor.can().deleteRow()}
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        {t('writer.nodes.removeRow')}
      </button>
      <button
        type="button"
        className={styles.button}
        onMouseDown={preventFocusLoss}
        disabled={!editor.can().addColumnAfter()}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        {t('writer.nodes.addColumn')}
      </button>
      <button
        type="button"
        className={styles.button}
        onMouseDown={preventFocusLoss}
        disabled={!editor.can().deleteColumn()}
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        {t('writer.nodes.removeColumn')}
      </button>
      <button
        type="button"
        className={styles.button}
        aria-pressed={editor.isActive('tableHeader')}
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      >
        {t('writer.nodes.toggleHeader')}
      </button>
      <div className={styles.alignGroup} role="group" aria-label={t('writer.nodes.cellAlign')}>
        {alignOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.alignButton}
            aria-label={option.label}
            aria-pressed={editor.isActive({ textAlign: option.value })}
            onMouseDown={preventFocusLoss}
            onClick={() => editor.chain().focus().setTextAlign(option.value).run()}
          >
            {option.label}
          </button>
        ))}
      </div>
    </BubbleMenu>
  )
}
