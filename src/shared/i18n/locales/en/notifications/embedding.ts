import type { Resources } from '../../zh'

const embedding: Resources['notifications']['embedding'] = {
  notConfigured: 'Embedding model not configured',
  modelNotFound: 'Embedding model not found',
  emptyApiResponse:
    'The embedding API returned empty data. Check that the baseUrl, model name, and endpoint are compatible with the OpenAI /v1/embeddings format',
  baseUrlExcludesEmbeddings:
    '{{message}}. The API base URL should end at /v1 (for example http://127.0.0.1:1234/v1) and must not include /embeddings',
  baseUrlRequiresV1:
    '{{message}}. The API base URL must include /v1 (for example http://127.0.0.1:1234/v1)',
  batchInputEmpty: 'Batch embedding input cannot be empty',
  inputListEmpty: 'The input text list cannot be empty',
  tokenLimitExceeded:
    'Estimated tokens for a single text ({{tokens}}) exceed the per-minute limit ({{limit}}). Reduce the knowledge base chunk size and retry',
  embedFailed: 'Embedding generation failed: {{reason}}',
  batchEmbedFailed: 'Batch embedding generation failed: {{reason}}',
  indexingCancelled: 'Indexing was cancelled by the user',
  responseCountMismatch:
    'Embedding response count mismatch: expected {{expected}}, received {{actual}}',
  presetModelNotFound: 'Preset model not found: {{presetId}}',
  modelServiceInitFailed: 'Failed to initialize the embedding model service: {{reason}}',
  listModelsFailed: 'Failed to get the embedding model list: {{reason}}',
  getModelFailed: 'Failed to get the embedding model: {{reason}}',
  saveModelFailed: 'Failed to save the embedding model: {{reason}}',
  deleteModelFailed: 'Failed to delete the embedding model: {{reason}}',
  testModelConnectionFailed: 'Failed to test the embedding model connection: {{reason}}',
  getPresetsFailed: 'Failed to get preset models: {{reason}}',
  createFromPresetFailed: 'Failed to create the embedding configuration: {{reason}}',
  getConfigFailed: 'Failed to get the embedding configuration: {{reason}}',
  setConfigFailed: 'Failed to set the embedding configuration: {{reason}}',
  testConnectionFailed: 'Failed to test the embedding connection: {{reason}}',
  embedHandlerFailed: 'Failed to generate the embedding vector: {{reason}}',
  embedBatchHandlerFailed: 'Failed to generate embedding vectors in batch: {{reason}}',
  nativeModuleLoadFailed:
    'Failed to load the LanceDB native module. Verify the installation package includes dependencies for the current system architecture: {{reason}}',
  chunkVectorCountMismatch: 'Document chunk count and vector count do not match',
  addChunksFailed: 'Failed to add document chunks: {{reason}}',
  deleteFileChunksFailed: 'Failed to delete document chunks for the file: {{reason}}',
  vectorSearchFailed: 'Vector search failed: {{reason}}'
}

export default embedding
