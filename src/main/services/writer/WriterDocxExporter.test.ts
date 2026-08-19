import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WriterExportDocument, WriterResult } from '@shared/types/writer'
import { WriterDocxExporter, type WriterFormulaRasterizerPort } from './WriterDocxExporter'

/** 1x1 透明 PNG */
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

class FakeFormulaRasterizer implements WriterFormulaRasterizerPort {
  private readonly png: Buffer | null

  constructor(png: Buffer | null) {
    this.png = png
  }

  async rasterize(_latex: string, _displayMode: boolean): Promise<WriterResult<Buffer>> {
    if (!this.png) {
      return { success: false, code: 'io_error', error: '公式栅格化失败' }
    }
    return { success: true, data: this.png }
  }
}

function createRichExportDocument(imageSourcePath?: string): WriterExportDocument {
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
      {
        kind: 'image',
        assetPath: 'hash.png',
        alt: '示意图',
        width: 80
      },
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
    assets: imageSourcePath ? [{ sourcePath: imageSourcePath, exportName: 'hash.png' }] : [],
    warnings: []
  }
}

function createMathExportDocument(latex: string): WriterExportDocument {
  return {
    title: '公式文档',
    nodes: [{ kind: 'math', display: true, latex }],
    assets: [],
    warnings: []
  }
}

test('DOCX 是 ZIP 并包含正文与图片媒体', async () => {
  const root = mkdtempSync(join(tmpdir(), 'writer-docx-'))
  try {
    const imagePath = join(root, 'hash.png')
    writeFileSync(imagePath, VALID_PNG)

    const rasterizer = new FakeFormulaRasterizer(VALID_PNG)
    const buffer = await new WriterDocxExporter(rasterizer).render(
      createRichExportDocument(imagePath)
    )

    assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK')
    assert.equal(buffer.includes(Buffer.from('word/document.xml')), true)
    assert.equal(buffer.includes(Buffer.from('word/media/')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('公式图片模型携带 LaTeX 替代文本', async () => {
  const rasterizer = new FakeFormulaRasterizer(VALID_PNG)
  const result = await new WriterDocxExporter(rasterizer).build(
    createMathExportDocument('E = mc^2')
  )
  assert.equal(result.formulas[0]?.altText.description, 'E = mc^2')
  assert.equal(result.formulas[0]?.altText.title, 'LaTeX formula')
  assert.equal(result.formulas[0]?.altText.name, 'formula')
})

test('公式栅格化失败时写入可读 LaTeX 并产生警告', async () => {
  const rasterizer = new FakeFormulaRasterizer(null)
  const result = await new WriterDocxExporter(rasterizer).build(createMathExportDocument('\\frac{'))
  assert.ok(result.plainText.includes('\\frac{'))
  assert.equal(result.warnings.length, 1)
  assert.equal(result.formulas.length, 0)
})

test('原子写出成功后生成最终 docx，失败清理临时文件', async () => {
  const root = mkdtempSync(join(tmpdir(), 'writer-docx-export-'))
  try {
    const outputPath = join(root, 'out.docx')
    const exporter = new WriterDocxExporter(new FakeFormulaRasterizer(VALID_PNG))
    const result = await exporter.export(createMathExportDocument('a+b'), outputPath)
    assert.equal(result.success, true)
    assert.equal(existsSync(outputPath), true)
    assert.equal(existsSync(`${outputPath}.tmp`), false)
    assert.equal(readFileSync(outputPath).subarray(0, 2).toString('ascii'), 'PK')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('任务列表使用 Unicode 勾选框文本降级', async () => {
  const result = await new WriterDocxExporter(new FakeFormulaRasterizer(VALID_PNG)).build(
    createRichExportDocument()
  )
  assert.ok(result.plainText.includes('\u2611 \u5df2\u5b8c\u6210'))
})
