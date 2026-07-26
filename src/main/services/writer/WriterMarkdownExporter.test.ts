import assert from 'node:assert/strict'
import test from 'node:test'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WriterExportDocument } from '@shared/types/writer'
import { WriterMarkdownExporter } from './WriterMarkdownExporter'

function createRichExportDocument(sourcePath?: string): WriterExportDocument {
  return {
    title: '通用文档',
    nodes: [
      {
        kind: 'heading',
        level: 1,
        runs: [{ kind: 'text', text: '章节标题' }]
      },
      {
        kind: 'paragraph',
        runs: [
          { kind: 'text', text: '含脚注' },
          { kind: 'footnoteRef', number: 1 }
        ]
      },
      { kind: 'math', display: true, latex: 'E = mc^2' },
      { kind: 'image', assetPath: 'hash.png', alt: '示意图', width: 80 },
      {
        kind: 'table',
        rows: [
          {
            cells: [
              { header: true, runs: [{ kind: 'text', text: '名称' }] },
              { header: true, runs: [{ kind: 'text', text: '数值' }] }
            ]
          },
          {
            cells: [
              { header: false, runs: [{ kind: 'text', text: 'A' }] },
              { header: false, runs: [{ kind: 'text', text: '1' }] }
            ]
          }
        ]
      },
      {
        kind: 'taskList',
        items: [
          {
            checked: true,
            nodes: [{ kind: 'paragraph', runs: [{ kind: 'text', text: '已完成' }] }]
          }
        ]
      },
      {
        kind: 'footnotes',
        items: [{ number: 1, runs: [{ kind: 'text', text: '脚注说明' }] }]
      }
    ],
    assets: sourcePath
      ? [{ sourcePath, exportName: 'hash.png' }]
      : [{ sourcePath: '/tmp/hash.png', exportName: 'hash.png' }],
    warnings: []
  }
}

test('Markdown 使用相对图片、GFM 表格任务和脚注', async () => {
  const exporter = new WriterMarkdownExporter()
  const result = await exporter.render(createRichExportDocument())
  assert.match(result.markdown, /!\[示意图\]\(通用文档\.assets\/hash\.png\)/)
  assert.match(result.markdown, /\| 名称 \| 数值 \|/)
  assert.match(result.markdown, /- \[x\] 已完成/)
  assert.match(result.markdown, /\[\^1\]/)
  assert.match(result.markdown, /\$\$[\s\S]*E = mc\^2[\s\S]*\$\$/)
})

test('render 可指定 assetsBaseName，与 export 输出 basename 对齐', async () => {
  const exporter = new WriterMarkdownExporter()
  const result = await exporter.render(createRichExportDocument(), {
    assetsBaseName: '自定义导出名'
  })
  assert.match(result.markdown, /!\[示意图\]\(自定义导出名\.assets\/hash\.png\)/)
})

test('链接与 Markdown 特殊字符正确转义', async () => {
  const exporter = new WriterMarkdownExporter()
  const result = await exporter.render({
    title: '转义',
    nodes: [
      {
        kind: 'paragraph',
        runs: [
          {
            kind: 'text',
            text: 'a*b_c[d]',
            marks: { href: 'https://example.com/a)b' }
          }
        ]
      }
    ],
    assets: [],
    warnings: []
  })
  // 链接目标中的括号被编码；正文 * _ [ 被转义
  assert.match(result.markdown, /\[.*\]\(https:\/\/example\.com\/a%29b\)/)
  assert.match(result.markdown, /\\\*/)
  assert.match(result.markdown, /\\_/)
  assert.match(result.markdown, /\\\[/)
})

test('代码围栏中包含反引号时自动增加围栏长度', async () => {
  const exporter = new WriterMarkdownExporter()
  const result = await exporter.render({
    title: '代码',
    nodes: [{ kind: 'code', language: 'js', text: 'const x = `hi`' }],
    assets: [],
    warnings: []
  })
  assert.match(result.markdown, /````js\nconst x = `hi`\n````/)
})

test('无法表达节点以可读文本降级并保留警告', async () => {
  const exporter = new WriterMarkdownExporter()
  const document = createRichExportDocument()
  document.warnings = ['节点 unknownWidget 无法完整表达，已降级为纯文本']
  document.nodes.unshift({
    kind: 'paragraph',
    runs: [{ kind: 'text', text: '[无法导出的节点: unknownWidget] 残留文本' }]
  })
  const result = await exporter.render(document)
  assert.match(result.markdown, /无法导出的节点: unknownWidget/)
  assert.deepEqual(result.warnings, document.warnings)
})

test('原子写出成功后生成最终 md 与 assets，失败清理临时产物', async (t) => {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-writer-md-export-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))

  const sourceDir = join(rootPath, 'source')
  mkdirSync(sourceDir, { recursive: true })
  const sourcePath = join(sourceDir, 'hash.png')
  writeFileSync(sourcePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

  const exporter = new WriterMarkdownExporter()
  const outputPath = join(rootPath, '通用文档.md')
  const result = await exporter.export(createRichExportDocument(sourcePath), outputPath)

  assert.equal(result.success, true)
  assert.equal(existsSync(outputPath), true)
  assert.equal(existsSync(join(rootPath, '通用文档.assets', 'hash.png')), true)
  assert.match(readFileSync(outputPath, 'utf8'), /!\[示意图\]\(通用文档\.assets\/hash\.png\)/)

  // 确认临时产物不残留
  const tempMd = join(rootPath, '通用文档.md.tmp')
  const tempAssets = join(rootPath, '通用文档.assets.tmp')
  assert.equal(existsSync(tempMd), false)
  assert.equal(existsSync(tempAssets), false)

  // 失败路径：缺失源图时清理临时文件且不覆盖已有原文
  writeFileSync(outputPath, '# 原文\n')
  const missing = await exporter.export(
    createRichExportDocument(join(rootPath, 'missing.png')),
    outputPath
  )
  assert.equal(missing.success, false)
  assert.equal(readFileSync(outputPath, 'utf8'), '# 原文\n')
  assert.equal(existsSync(tempMd), false)
  assert.equal(existsSync(tempAssets), false)
})

test('导出中途失败时保留已有 .assets 原内容', async (t) => {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-writer-md-assets-preserve-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))

  const assetsDir = join(rootPath, '报告.assets')
  mkdirSync(assetsDir, { recursive: true })
  const originalAsset = join(assetsDir, 'original.png')
  const originalBytes = Buffer.from([0x01, 0x02, 0x03, 0x04])
  writeFileSync(originalAsset, originalBytes)
  writeFileSync(join(rootPath, '报告.md'), '# 旧稿\n')

  const exporter = new WriterMarkdownExporter()
  const failed = await exporter.export(
    createRichExportDocument(join(rootPath, 'does-not-exist.png')),
    join(rootPath, '报告.md')
  )

  assert.equal(failed.success, false)
  assert.equal(existsSync(assetsDir), true)
  assert.deepEqual(readFileSync(originalAsset), originalBytes)
  assert.equal(readFileSync(join(rootPath, '报告.md'), 'utf8'), '# 旧稿\n')
  assert.equal(existsSync(join(rootPath, '报告.assets.tmp')), false)
  assert.equal(existsSync(join(rootPath, '报告.assets.bak')), false)
})

test('覆盖已有 assets 时原子替换，成功后无 backup 残留', async (t) => {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-writer-md-assets-swap-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))

  const assetsDir = join(rootPath, '通用文档.assets')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(join(assetsDir, 'old.png'), Buffer.from([0xaa]))
  writeFileSync(join(rootPath, '通用文档.md'), '# 旧\n')

  const sourceDir = join(rootPath, 'source')
  mkdirSync(sourceDir, { recursive: true })
  const sourcePath = join(sourceDir, 'hash.png')
  const newBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
  writeFileSync(sourcePath, newBytes)

  const exporter = new WriterMarkdownExporter()
  const result = await exporter.export(
    createRichExportDocument(sourcePath),
    join(rootPath, '通用文档.md')
  )

  assert.equal(result.success, true)
  assert.equal(existsSync(join(assetsDir, 'hash.png')), true)
  assert.deepEqual(readFileSync(join(assetsDir, 'hash.png')), newBytes)
  assert.equal(existsSync(join(assetsDir, 'old.png')), false)
  assert.equal(existsSync(join(rootPath, '通用文档.assets.bak')), false)
  assert.equal(existsSync(join(rootPath, '通用文档.md.bak')), false)
})
