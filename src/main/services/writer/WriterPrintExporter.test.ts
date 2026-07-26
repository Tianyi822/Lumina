import assert from 'node:assert/strict'
import test from 'node:test'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WriterExportDocument } from '@shared/types/writer'
import {
  WriterPrintExporter,
  type WriterPrintPdfPort
} from './WriterPrintExporter'
import { WriterPrintHtmlRenderer } from './WriterPrintHtmlRenderer'

function createRichExportDocument(): WriterExportDocument {
  return {
    title: '打印文档',
    nodes: [
      {
        kind: 'paragraph',
        runs: [{ kind: 'text', text: '正文' }]
      },
      { kind: 'math', display: true, latex: 'a^2' }
    ],
    assets: [],
    warnings: []
  }
}

function createPrintExporter(overrides: Partial<WriterPrintPdfPort> = {}): WriterPrintExporter {
  const port: WriterPrintPdfPort = {
    printHtmlToPdf: overrides.printHtmlToPdf ?? (async () => Buffer.from('%PDF-1.4 fake'))
  }
  return new WriterPrintExporter(new WriterPrintHtmlRenderer(), port)
}

test('printToPDF 失败会删除临时文件且不覆盖目标', async () => {
  const root = mkdtempSync(join(tmpdir(), 'writer-print-'))
  try {
    const outputPath = join(root, 'out.pdf')
    writeFileSync(outputPath, '原目标', 'utf8')

    const exporter = createPrintExporter({
      printHtmlToPdf: async () => {
        throw new Error('打印失败')
      }
    })
    const result = await exporter.export(createRichExportDocument(), outputPath)
    assert.equal(result.success, false)
    assert.equal(existsSync(`${outputPath}.tmp`), false)
    assert.equal(readFileSync(outputPath, 'utf8'), '原目标')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('导出成功写入 PDF 头且清理临时文件', async () => {
  const root = mkdtempSync(join(tmpdir(), 'writer-print-ok-'))
  try {
    const outputPath = join(root, 'ok.pdf')
    const exporter = createPrintExporter({
      printHtmlToPdf: async (html) => {
        assert.match(html, /default-src 'none'/)
        assert.match(html, /class="katex"/)
        return Buffer.from('%PDF-1.4 ok')
      }
    })
    const result = await exporter.export(createRichExportDocument(), outputPath)
    assert.equal(result.success, true)
    assert.equal(existsSync(`${outputPath}.tmp`), false)
    assert.equal(readFileSync(outputPath, 'utf8').startsWith('%PDF'), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
