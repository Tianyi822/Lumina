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
  batchProcessFailed: 'Batch document processing failed: {{reason}}',
  fileTooLarge:
    'File is too large ({{size}}). The limit is 10MB. Use the knowledge base feature for large files',
  outOfMemoryLargeFile:
    'The file is too large to fit in memory. Use the knowledge base feature for large files',
  fileInvalidOrCorrupted: 'The file format is invalid or corrupted. Check that the file is intact'
}

export default document
