import type { Resources } from '../zh'

const chrome: Resources['chrome'] = {
  nav: {
    ariaPrimary: 'Primary navigation',
    read: 'Read',
    knowledge: 'Knowledge',
    writer: 'Write',
    addPaper: 'Add paper',
    addKnowledge: 'New knowledge base',
    addDocument: 'New document',
    expandSidebar: 'Expand secondary sidebar',
    collapseSidebar: 'Collapse secondary sidebar',
    themeSwitch: 'Theme',
    themeLight: 'Light theme',
    themeDark: 'Dark theme',
    settings: 'Settings',
    settingsWithUpdate: 'Settings, new version available'
  },
  sidebar: {
    searchPaper: 'Search papers',
    searchKnowledge: 'Search knowledge bases',
    searchDocument: 'Search documents',
    manageFiles: 'Manage files',
    needsReindex: 'Needs reindex',
    deleteKnowledgeBase: 'Delete knowledge base',
    noMatchKnowledge: 'No matching knowledge bases',
    emptyKnowledge: 'No knowledge bases yet',
    createFirstKnowledge: 'Create your first knowledge base',
    documentCount_one: '{{count}} document',
    documentCount_other: '{{count}} documents',
    tabDocuments: 'Documents',
    tabOutline: 'Outline',
    writerSidebarAria: 'Writer sidebar content',
    collectionsAria: 'Document collections',
    favorite: 'Favorites',
    recent: 'Recent',
    all: 'All',
    folders: 'Folders',
    deleteFolderNamed: 'Delete folder {{name}}',
    folderEmpty: 'No documents in this folder',
    loadingDocuments: 'Loading documents...',
    noMatchDocument: 'No matching documents',
    emptyDocument: 'No documents yet',
    favoriteRemove: 'Remove from favorites',
    favoriteAdd: 'Add to favorites',
    deleteDocumentPermanent: 'Delete permanently'
  },
  window: {
    minimize: 'Minimize',
    minimizeAria: 'Minimize window',
    maximize: 'Maximize',
    maximizeAria: 'Maximize window',
    restore: 'Restore',
    restoreAria: 'Restore window',
    close: 'Close',
    closeAria: 'Close window'
  },
  toolbar: {
    paperTools: 'Paper tools',
    writerTools: 'Writer tools',
    hideTranslation: 'Hide translation',
    hideTranslationBackground: 'Hide translation (continues in background)',
    showTranslation: 'Show translation',
    showTranslationBackground: 'Show translation (translating in background)',
    translatePaper: 'Translate paper',
    noCaption: 'No caption',
    openToc: 'Open table of contents',
    toc: 'Table of contents',
    tocLoading: 'Loading table of contents',
    tocEmpty: 'No table of contents detected',
    openFigures: 'Open paper figures',
    figures: 'Figures',
    figuresAria: 'Paper figures',
    figuresLoading: 'Loading figures',
    figuresEmpty: 'No figures detected',
    preview: 'Preview',
    originalPdf: 'Original PDF',
    chat: 'Chat',
    writerChat: 'Writer chat',
    exportDocument: 'Export document',
    exportFormats: 'Export formats'
  },
  pages: {
    selectPaperTitle: 'Select a paper to start reading',
    selectPaperBody:
      'Pick an existing paper from the list on the left, or upload a PDF to start reading.',
    uploadPdf: 'Upload PDF',
    loadingDocument: 'Loading document...',
    loadDocumentFailed: 'Failed to load document',
    selectDocumentTitle: 'Select a document, or start writing something new',
    newDocument: 'New document'
  },
  app: {
    errorTitle: 'Something went wrong',
    reload: 'Reload'
  }
}

export default chrome
