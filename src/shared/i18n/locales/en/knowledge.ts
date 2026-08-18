import type { Resources } from '../zh'

const knowledge: Resources['knowledge'] = {
  common: {
    poolLabel: 'File pool',
    noMatchingFiles: 'No matching files',
    searchPlaceholder: 'Search files...'
  },
  main: {
    descriptionPlaceholder: 'Describe the purpose, scope, and retrieval constraints...',
    descriptionEmptyHint: 'Double-click to edit the purpose, scope, and retrieval constraints.',
    reindexNeededTitle: 'Reindex needed',
    reindexNeededBody: 'Paper notes were updated. Reindex to use the latest notes in retrieval.',
    emptyTitle: 'Select or create a knowledge base',
    emptyBody: 'Pick a knowledge base on the left to manage documents, indexes, and retrieval.'
  },
  form: {
    title: 'Create knowledge base',
    nameLabel: 'Knowledge base name *',
    namePlaceholder: 'e.g. Product docs, tech specs...',
    descriptionLabel: 'Description (optional)',
    descriptionPlaceholder: 'Briefly describe what this knowledge base is for...',
    modelLabel: 'Embedding model *',
    modelEmpty: 'No models available. Configure an embedding model in Settings first',
    modelDimensions: '{{dimensions}}-dim',
    modelHint:
      'The embedding model converts text into vectors for semantic search. It cannot be changed after creation.',
    chunkLabel: 'Chunking strategy',
    presetFineName: 'Fine-grained',
    presetFineDesc: 'For code and legal text; precise matching',
    presetBalancedName: 'Balanced',
    presetBalancedDesc: 'General purpose, recommended',
    presetLongName: 'Long context',
    presetLongDesc: 'For papers and novels; keeps paragraphs intact',
    customName: 'Custom',
    customDesc: 'Set chunking parameters manually',
    chunkSize: 'Chunk size',
    overlapSize: 'Overlap size',
    chunkHint: 'Chunking affects retrieval quality and cannot be changed after creation.',
    submit: 'Create'
  },
  stats: {
    embeddingModel: 'Embedding model',
    vectorDimensions: 'Vector dimensions',
    chunkSize: 'Chunk size',
    indexedFiles: 'Indexed files',
    docChunks: 'Document chunks',
    dbSize: 'Database size'
  },
  search: {
    title: 'Search test',
    hint: 'Verify recall quality and chunk hits for the current knowledge base.',
    placeholder: 'Enter a test query...',
    submit: 'Search',
    resultsTitle: 'Results',
    resultsCount_one: '{{count}} result',
    resultsCount_other: '{{count}} results',
    empty: 'No relevant results',
    chunkPosition: 'Chunk {{index}} / {{total}}'
  },
  fileList: {
    title: 'Linked documents',
    count_one: '{{count}} file',
    count_other: '{{count}} files',
    reindex: 'Reindex',
    reindexing: 'Indexing...',
    addDocument: 'Add documents',
    dropTitle: 'Drop files to upload and attach',
    dropHint: 'Supports TXT, Markdown, PDF, Word, and CSV.',
    loading: 'Loading documents...',
    emptyTitle: 'No documents attached to this knowledge base yet',
    emptyHint: 'Pick existing documents from the file pool, or drag files here to upload.',
    emptyAction: 'Add the first document',
    unlinkTitle: 'Unlink',
    indexSyncing: 'Index syncing',
    addMore: 'Add more documents or drag to upload'
  },
  fileManager: {
    title: 'File management',
    fileCount_one: '{{count}} file',
    fileCount_other: '{{count}} files',
    emptyPool: 'No files yet. Upload a file',
    confirmDeleteTitle: 'Delete file?',
    confirmDeleteSubtitle: 'This also affects linked knowledge bases.',
    deleteUsage_one:
      'The file "<strong>{{name}}</strong>" is used by <strong>{{count}}</strong> knowledge base.',
    deleteUsage_other:
      'The file "<strong>{{name}}</strong>" is used by <strong>{{count}}</strong> knowledge bases.',
    confirmDeleteWarning:
      'Deleting this file removes it from all linked knowledge bases. This cannot be undone.',
    forceDelete: 'Force delete',
    usageBadge: 'In use',
    deleteTitleUsed: 'File is used by knowledge bases; delete with care',
    deleteTitle: 'Delete file'
  },
  fileSelector: {
    title: 'Add files',
    availableCount_one: '{{count}} file available',
    availableCount_other: '{{count}} files available',
    emptyAvailable: 'No files to add. Drop files above or choose files to upload',
    selectedCount_one: '{{count}} file selected',
    selectedCount_other: '{{count}} files selected',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    addToKnowledge: 'Add to knowledge base'
  },
  upload: {
    dropHintActive: 'Drop files here to upload, or click to choose',
    dropHint: 'Drop files here, or click to choose',
    autoValidate: 'Format and size are validated automatically.',
    supportedTypes: 'Supports {{types}}, up to 50MB',
    uploading: 'Uploading...'
  },
  preview: {
    openExternal: 'Open externally',
    loading: 'Loading file content...',
    errorTitle: 'File preview failed',
    truncated:
      'The file is too long and has been truncated. To view it in full, click "Open externally" to use a system app.',
    openFailed: 'Failed to open file'
  },
  fileSource: {
    paper: 'Paper',
    paperNote: 'Paper note',
    uploadedFile: 'Uploaded file',
    paperWithName: 'Paper: {{name}}'
  }
}

export default knowledge
