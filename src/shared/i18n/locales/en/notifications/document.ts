import type { Resources } from '../../zh'

const document: Resources['notifications']['document'] = {
  unsupportedFileType: 'Unsupported file type: {{ext}}',
  pdfParseFailed: 'PDF parsing failed: {{reason}}',
  docxParseFailed: 'DOCX parsing failed: {{reason}}',
  docParseFailed: 'DOC parsing failed: {{reason}}',
  excelInvalidFile: 'The Excel file is invalid or corrupted',
  excelParseFailed: 'Excel parsing failed: {{reason}}',
  pptxParseFailed: 'PPTX parsing failed: {{reason}}',
  processFailed: 'Document processing failed: {{reason}}',
  batchProcessFailed: 'Batch document processing failed: {{reason}}'
}

export default document
