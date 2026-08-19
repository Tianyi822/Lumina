import type { Resources } from '../zh'

const paper: Resources['paper'] = {
  sidebar: {
    statusIdle: 'Not started',
    statusQueued: 'Queued for OCR',
    statusProcessing: 'Processing',
    statusCompleted: 'Completed',
    statusPartialFailed: 'Partially failed',
    statusFailed: 'Failed',
    statusCancelled: 'Cancelled',
    retryTitleScreenshot: 'Screenshot stage failed',
    retryTitlePartial: 'OCR partially failed',
    retryTitleOcr: 'OCR stage failed',
    renderFailedHint: 'Page rendering failed. Please retry manually.',
    hasFailedPagesHint: 'Some pages failed to parse. Retrying will run OCR again.',
    ocrFailedHint: 'OCR failed. Please retry manually.',
    unreadableFailed: 'Processing failed; not readable yet',
    unreadableIncomplete: 'OCR incomplete; not readable yet',
    unreadableProcessing: 'Processing; not readable yet',
    pagesCount_one: '{{count}} page',
    pagesCount_other: '{{count}} pages',
    hasTranslation: 'Translated',
    deleteTranslation: 'Delete translation',
    deleteTranslationTooltip: 'Click to delete the translation',
    screenshotProgress: 'Screenshot progress',
    ocrProgress: 'OCR progress',
    retry: 'Retry',
    deletePaperTooltip: 'Delete paper'
  },
  reader: {
    searchPlaceholder: 'Search...',
    searchNoResult: 'No results',
    prevMatch: 'Previous (Shift+Enter)',
    nextMatch: 'Next (Enter)',
    closeSearch: 'Close (Esc)',
    loadingContent: 'Loading content...',
    emptyContent: 'No content',
    parseErrorPrefix: 'Markdown parse failed: '
  },
  pdf: {
    loadFailed: 'Failed to load the original PDF',
    noPaperSelected: 'No paper selected',
    pageAria: 'Original PDF, page {{index}}',
    renderFailed: 'Page rendering failed',
    loading: 'Loading the original PDF...'
  },
  segmentList: {
    retranslate: 'Retranslate',
    retranslateHint:
      'This segment failed to translate. Clicking translate again will fill in the rest.',
    translating: 'Translating...',
    confirmTitle: 'Retranslate',
    confirmMessage:
      'This segment has annotations or notes. Retranslating will delete them together.',
    continueButton: 'Continue'
  },
  figures: {
    resizeN: 'Resize preview from the top',
    resizeE: 'Resize preview from the right',
    resizeS: 'Resize preview from the bottom',
    resizeW: 'Resize preview from the left',
    resizeNE: 'Resize preview from the top right',
    resizeNW: 'Resize preview from the top left',
    resizeSE: 'Resize preview from the bottom right',
    resizeSW: 'Resize preview from the bottom left',
    previewAria: 'Paper figure preview',
    panelTitle: 'Paper figures',
    unpin: 'Unpin',
    pin: 'Pin preview',
    closeAria: 'Close figure preview',
    prev: 'Previous',
    prevAria: 'View previous figure',
    next: 'Next',
    nextAria: 'View next figure'
  },
  annotation: {
    menu: {
      addNote: 'Add note',
      addToChat: 'Add to chat'
    },
    noteEditor: {
      titleEdit: 'Edit note',
      titleCreate: 'Add note',
      closeAria: 'Close note editor',
      placeholder: 'Write a note for this passage...',
      delete: 'Delete note',
      updateSaving: 'Updating...',
      update: 'Update note',
      createSaving: 'Saving...',
      create: 'Save note',
      syncNotice:
        'This note only appears in the current translation; deleting the translation deletes its annotations too.'
    },
    popover: {
      deleteHighlight: 'Delete highlight',
      deleteNote: 'Delete note',
      addNote: 'Add note',
      editNote: 'Edit note'
    }
  },
  chat: {
    panelTitle: 'Paper chat',
    scrollToBottomAria: 'Scroll to bottom',
    emptyGreeting: 'Start asking about this paper',
    sessionTitle: 'Paper chat: {{name}}',
    taskLabel: 'Task {{index}}',
    phaseLabel: 'Phase {{number}}',
    iterationPhase: 'Phase {{number}}',
    quoteOriginal: 'Original quote',
    quoteTranslation: 'Translation quote',
    context: 'Context',
    input: {
      replyPlaceholder: 'Pick a reply',
      custom: 'Custom',
      suggestCapabilities: 'Suggested capabilities',
      ignore: 'Ignore',
      enableCapability: 'Enable {{name}}',
      selectOption: 'I choose: {{value}}',
      attachment: 'Attachment',
      customPlaceholder: 'Type a custom answer, or pick a suggestion above ...',
      askPlaceholder: 'Ask anything',
      dropToAttach: 'Drop to attach',
      addAttachmentOrTool: 'Add attachment or configure tools',
      addAttachment: 'Add attachment',
      search: 'Search',
      knowledgeBases: 'Knowledge bases',
      send: 'Send',
      stop: 'Stop'
    },
    modelSelector: {
      select: 'Select model',
      empty: 'No model configured'
    },
    kb: {
      documentCount_one: '{{count}} document',
      documentCount_other: '{{count}} documents',
      selected_one: '{{count}} knowledge base selected',
      selected_other: '{{count}} knowledge bases selected',
      compactLabel: 'KB',
      label: 'Knowledge bases',
      panelTitle: 'Knowledge bases (multi-select)',
      availableCount_one: '{{count}} knowledge base available',
      availableCount_other: '{{count}} knowledge bases available',
      searchPlaceholder: 'Search knowledge bases...',
      searchAria: 'Search knowledge bases',
      selectAll: 'Select all',
      deselectAll: 'Deselect all',
      empty: 'No knowledge bases yet. Create one on the knowledge page',
      noMatch: 'No matching knowledge bases',
      collapse: 'Collapse',
      expand: 'Expand'
    },
    mcp: {
      selected_one: '{{count}} tool selected',
      selected_other: '{{count}} tools selected',
      compactLabel: 'MCP',
      label: 'MCP tools',
      panelTitle: 'MCP tools (multi-select)',
      connectedServers_one: '{{count}} server connected',
      connectedServers_other: '{{count}} servers connected',
      searchPlaceholder: 'Search tools...',
      searchAria: 'Search MCP tools',
      noMatch: 'No matching tools',
      empty: 'No tools available. Configure MCP servers in settings',
      selectAll: 'Select all',
      deselectAll: 'Deselect all',
      collapse: 'Collapse',
      expand: 'Expand'
    },
    plan: {
      statusPlanning: 'Planning',
      statusPlanned: 'Planned',
      statusRunning: 'Running',
      statusCompleted: 'Completed',
      statusFailed: 'Failed',
      statusCancelled: 'Cancelled',
      statusIdle: 'Standby',
      stepRunning: 'Running',
      stepSuccess: 'Done',
      stepFailed: 'Failed',
      stepCancelled: 'Cancelled',
      stepSkipped: 'Skipped',
      stepWaiting: 'Waiting',
      iterationCallingTools: 'Calling tools',
      iterationProcessing: 'Processing results',
      iterationComplete: 'Done',
      iterationThinking: 'Thinking',
      summaryWaiting: 'Waiting for the model to produce a plan',
      stepCount_one: '{{count}} step',
      stepCount_other: '{{count}} steps',
      planningIndicator: 'Breaking down the task'
    },
    interaction: {
      later: 'Later',
      expandMore_one: 'Show more ({{count}} total)',
      expandMore_other: 'Show more ({{count}} total)'
    },
    react: {
      toolCalls_one: '{{count}} tool call',
      toolCalls_other: '{{count}} tool calls',
      inProgress: 'In progress',
      phaseThinking: 'Phase reasoning',
      title: 'Step-by-step reasoning'
    },
    toolCall: {
      statusRunning: 'Running',
      statusSuccess: 'Done',
      statusError: 'Failed',
      statusWaiting: 'Waiting',
      params: 'Params',
      result: 'Result'
    },
    streaming: {
      organizing: 'Composing the answer',
      readingContext: 'The model is reading the paper context'
    },
    reasoning: {
      tokens: '~{{formatted}} tokens',
      title: 'Reasoning'
    },
    tokens: {
      summary: 'Total: {{total}} | Cached input: {{cached}} ({{rate}})'
    },
    message: {
      inputTokens: 'Input: ~{{formatted}} tokens'
    }
  }
}

export default paper
