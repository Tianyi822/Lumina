import type { Resources } from '../../zh'

const settings: Resources['notifications']['settings'] = {
  model: {
    validateFailedTitle: 'Model configuration validation failed',
    validateFieldEmpty: 'Field {{field}} is required for model "{{name}}"',
    fieldModelName: 'Model name',
    testSuccessTitle: 'Model connection test succeeded',
    testSuccessMessage: 'Model "{{name}}" is available',
    testFailedTitle: 'Model connection test failed',
    testFailedFallback: 'Connection test failed'
  },
  embedding: {
    title: 'Embedding model',
    deleted: 'Embedding model deleted',
    deleteFailed: 'Failed to delete embedding model',
    testSuccess: 'Connection test succeeded',
    testFailedFallback: 'Connection test failed',
    updated: 'Embedding model updated',
    added: 'Embedding model added',
    resaveNote: 'Saving an edit as a new configuration is expected; the original is not affected.',
    updateFailed: 'Failed to update embedding model',
    addFailed: 'Failed to add embedding model',
    saveTestConfigFailed: 'Failed to save test configuration',
    testFailedPrefix: 'Test failed: ',
    configSaved: 'Embedding model configuration saved'
  },
  mcp: {
    title: 'MCP server',
    validateNameRequired: 'Please enter a server name',
    validateCommandRequired: 'Command is required for MCP server "{{name}}"',
    validateUrlRequired: 'Server URL is required for MCP server "{{name}}"',
    importJsonRequired: 'Please paste the MCP config JSON',
    importSuccess_one: 'Imported {{count}} configuration',
    importSuccess_other: 'Imported {{count}} configurations',
    importFailedPrefix: 'Import failed: ',
    validateFailedTitle: 'Validation failed',
    formNameExists: 'This name already exists',
    formCommandRequired: 'Please enter the command',
    formUrlRequired: 'Please enter the server URL',
    loadFailed: 'Failed to load configurations',
    loadStatusFailed: 'Failed to load status',
    saveFailed: 'Save failed',
    deleteFailed: 'Delete failed',
    connectedTo: 'Connected to {{name}}',
    connectFailed: 'Connection failed',
    disconnectFailed: 'Failed to disconnect',
    testFoundTools_one: 'Test succeeded; found {{count}} tool',
    testFoundTools_other: 'Test succeeded; found {{count}} tools',
    testFailed: 'Connection test failed'
  },
  knowledgeMcp: {
    title: 'Knowledge base MCP',
    stopped: 'MCP server stopped',
    stopFailed: 'Failed to stop the server',
    started: 'MCP server started',
    startFailedPrefix: 'Failed to start the server: ',
    unknownError: 'Unknown error',
    operationFailedPrefix: 'Operation failed: ',
    copied: 'Configuration copied to clipboard',
    copyFailedPrefix: 'Copy failed: '
  },
  paperReader: {
    title: 'Paper reader',
    apiKeyRequired: 'Please enter the API key first',
    testSuccess: 'Connection test succeeded. Click Save to apply.',
    testFailedFallback: 'Connection test failed',
    testFailedPrefix: 'Test failed: ',
    saveFailed: 'Save failed',
    ocrSaved: 'OCR configuration saved',
    translationSaved: 'Translation model configuration saved'
  },
  update: {
    checkFailed: 'Update check failed. Try again later',
    downloadFailed: 'Failed to download the update',
    releasesFailed: 'Failed to load release history'
  }
}

export default settings
