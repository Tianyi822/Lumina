import { existsSync, mkdirSync, readFileSync, readdirSync } from 'fs'
import { dirname, join, normalize, sep } from 'path'
import type {
  BlockLabel,
  PaperLayoutBlock,
  PaperPageOcrResult,
  PaperTranslationCache,
  PaperTranslationEntry
} from '@shared/types/paper'
import {
  getPaperDirPath,
  getPaperFigureAssetPath,
  getPaperFigureAssetRelativePath,
  getPaperOcrNormalizedDirPath
} from './paperPaths'

export type PaperAssetDownloader = (remoteUrl: string, localPath: string) => Promise<boolean>

export interface LocalizePaperPageAssetsResult {
  pageResult: PaperPageOcrResult
  changed: boolean
  failedAssets: PaperAssetLocalizationFailure[]
}

export interface PaperAssetLocalizationFailure {
  pageIndex: number
  blockIndex: number
  remoteUrl: string
}

export interface LocalizePaperPageAssetsOptions {
  downloadAsset?: PaperAssetDownloader
  stripMissingRemoteAssets?: boolean
}

const LOCALIZABLE_ASSET_LABELS = new Set<BlockLabel>(['image', 'table', 'formula'])

export function isRemoteAssetUrl(content: string | undefined): boolean {
  return typeof content === 'string' && /^https?:\/\/\S+$/i.test(content.trim())
}

function escapeRegExp(content: string): string {
  return content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceAllLiteral(content: string, searchValue: string, replacement: string): string {
  return content.split(searchValue).join(replacement)
}

function createLocalAssetImageMarkup(localRelativePath: string): string {
  return `<div style='text-align: center;'><img src='${localRelativePath}' alt='OCR图片'/></div>`
}

function wrapBareLocalAssetReferences(markdown: string, localRelativePath: string): string {
  const escapedLocalPath = escapeRegExp(localRelativePath)
  const standaloneLocalPathPattern = new RegExp(
    `(^|\\n)([ \\t]*)${escapedLocalPath}[ \\t]*(?=\\n|$)`,
    'g'
  )

  return markdown.replace(
    standaloneLocalPathPattern,
    (_match, linePrefix: string) => `${linePrefix}${createLocalAssetImageMarkup(localRelativePath)}`
  )
}

function localizeRemoteAssetReferences(
  markdown: string,
  remoteUrl: string,
  localRelativePath: string
): string {
  const localizedMarkdown = replaceAllLiteral(markdown, remoteUrl, localRelativePath)
  return wrapBareLocalAssetReferences(localizedMarkdown, localRelativePath)
}

function stripRemoteAssetMarkup(markdown: string, remoteUrl: string): string {
  const escapedSource = escapeRegExp(remoteUrl)
  const patterns = [
    new RegExp(
      `<div[^>]*>\\s*<img\\b[^>]*src=['"]${escapedSource}['"][^>]*\\/?>(?:\\s*</img>)?\\s*</div>`,
      'gi'
    ),
    new RegExp(`<img\\b[^>]*src=['"]${escapedSource}['"][^>]*\\/?>(?:\\s*</img>)?`, 'gi'),
    new RegExp(`!\\[[^\\]]*\\]\\(${escapedSource}\\)`, 'gi')
  ]

  let nextMarkdown = markdown
  for (const pattern of patterns) {
    nextMarkdown = nextMarkdown.replace(pattern, '')
  }

  return replaceAllLiteral(nextMarkdown, remoteUrl, '')
}

function cleanupStrippedAssetGaps(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}

function shouldLocalizeBlock(block: PaperLayoutBlock): boolean {
  return LOCALIZABLE_ASSET_LABELS.has(block.label)
}

export function getBlockRemoteAssetUrl(block: PaperLayoutBlock): string | undefined {
  if (isRemoteAssetUrl(block.remoteAssetUrl)) {
    return block.remoteAssetUrl?.trim()
  }

  if (shouldLocalizeBlock(block) && isRemoteAssetUrl(block.content)) {
    return block.content.trim()
  }

  return undefined
}

function isSafePaperAssetRelativePath(content: string | undefined): content is string {
  return typeof content === 'string' && /^assets\/page-\d{4}\/crop-\d{4}\.png$/i.test(content)
}

function getLocalAssetAbsolutePath(paperId: string, localAssetPath: string): string {
  const paperDir = getPaperDirPath(paperId)
  const absolutePath = normalize(join(paperDir, localAssetPath))
  const normalizedPaperDir = normalize(paperDir)

  if (
    absolutePath !== normalizedPaperDir &&
    absolutePath.startsWith(`${normalizedPaperDir}${sep}`)
  ) {
    return absolutePath
  }

  return getPaperFigureAssetPath(paperId, 0, 0)
}

function getExistingLocalAssetPath(paperId: string, block: PaperLayoutBlock): string | undefined {
  if (!isSafePaperAssetRelativePath(block.localAssetPath)) {
    return undefined
  }

  const absolutePath = getLocalAssetAbsolutePath(paperId, block.localAssetPath)
  return existsSync(absolutePath) ? block.localAssetPath : undefined
}

function ensureAssetDir(localPath: string): void {
  const dirPath = dirname(localPath)
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

function replaceRemoteUrlInBlockContent(
  block: PaperLayoutBlock,
  remoteUrl: string,
  replacement: string
): PaperLayoutBlock {
  if (!block.content.includes(remoteUrl)) {
    return block
  }

  return {
    ...block,
    content: replaceAllLiteral(block.content, remoteUrl, replacement)
  }
}

export async function localizePaperPageAssets(
  paperId: string,
  pageResult: PaperPageOcrResult,
  options: LocalizePaperPageAssetsOptions = {}
): Promise<LocalizePaperPageAssetsResult> {
  let changed = false
  const replacements = new Map<string, string>()
  const missingRemoteUrls = new Set<string>()
  const failedAssets: PaperAssetLocalizationFailure[] = []

  const nextBlocks = await Promise.all(
    pageResult.blocks.map(async (block) => {
      if (!shouldLocalizeBlock(block)) {
        return block
      }

      const remoteUrl = getBlockRemoteAssetUrl(block)
      if (!remoteUrl) {
        return block
      }

      let nextBlock: PaperLayoutBlock = block
      if (nextBlock.remoteAssetUrl !== remoteUrl) {
        nextBlock = {
          ...nextBlock,
          remoteAssetUrl: remoteUrl
        }
        changed = true
      }

      let localRelativePath = getExistingLocalAssetPath(paperId, nextBlock)
      if (!localRelativePath) {
        localRelativePath = getPaperFigureAssetRelativePath(pageResult.pageIndex, nextBlock.index)
        const localAbsolutePath = getPaperFigureAssetPath(
          paperId,
          pageResult.pageIndex,
          nextBlock.index
        )

        if (!existsSync(localAbsolutePath)) {
          if (!options.downloadAsset) {
            localRelativePath = undefined
          } else {
            ensureAssetDir(localAbsolutePath)
            const downloaded = await options.downloadAsset(remoteUrl, localAbsolutePath)
            if (!downloaded) {
              localRelativePath = undefined
            }
          }
        }
      }

      if (!localRelativePath) {
        failedAssets.push({
          pageIndex: pageResult.pageIndex,
          blockIndex: nextBlock.index,
          remoteUrl
        })

        if (options.stripMissingRemoteAssets) {
          missingRemoteUrls.add(remoteUrl)
          const strippedBlock = replaceRemoteUrlInBlockContent(nextBlock, remoteUrl, '')
          if (strippedBlock !== nextBlock) {
            changed = true
          }
          return {
            ...strippedBlock,
            localAssetPath: undefined
          }
        }

        return nextBlock
      }

      replacements.set(remoteUrl, localRelativePath)
      if (nextBlock.localAssetPath !== localRelativePath) {
        nextBlock = {
          ...nextBlock,
          localAssetPath: localRelativePath
        }
        changed = true
      }

      const replacedBlock = replaceRemoteUrlInBlockContent(nextBlock, remoteUrl, localRelativePath)
      if (replacedBlock !== nextBlock) {
        changed = true
      }

      return replacedBlock
    })
  )

  let nextMarkdown = pageResult.markdown
  for (const [remoteUrl, localRelativePath] of replacements) {
    const replacedMarkdown = localizeRemoteAssetReferences(
      nextMarkdown,
      remoteUrl,
      localRelativePath
    )
    if (replacedMarkdown !== nextMarkdown) {
      nextMarkdown = replacedMarkdown
      changed = true
    }
  }

  if (options.stripMissingRemoteAssets) {
    for (const remoteUrl of missingRemoteUrls) {
      const strippedMarkdown = stripRemoteAssetMarkup(nextMarkdown, remoteUrl)
      if (strippedMarkdown !== nextMarkdown) {
        nextMarkdown = cleanupStrippedAssetGaps(strippedMarkdown)
        changed = true
      }
    }
  }

  if (!changed) {
    return {
      pageResult,
      changed: false,
      failedAssets
    }
  }

  return {
    pageResult: {
      ...pageResult,
      markdown: nextMarkdown,
      blocks: nextBlocks
    },
    changed,
    failedAssets
  }
}

export function createLocalAssetReplacementMap(
  paperId: string,
  pageResults: PaperPageOcrResult[]
): Map<string, string> {
  const replacements = new Map<string, string>()

  for (const pageResult of pageResults) {
    for (const block of pageResult.blocks) {
      const remoteUrl = getBlockRemoteAssetUrl(block)
      if (!remoteUrl || !isSafePaperAssetRelativePath(block.localAssetPath)) {
        continue
      }

      const localAbsolutePath = getLocalAssetAbsolutePath(paperId, block.localAssetPath)
      if (existsSync(localAbsolutePath)) {
        replacements.set(remoteUrl, block.localAssetPath)
      }
    }
  }

  return replacements
}

export function createLocalAssetReplacementMapFromDisk(paperId: string): Map<string, string> {
  const normalizedDir = getPaperOcrNormalizedDirPath(paperId)
  if (!existsSync(normalizedDir)) {
    return new Map()
  }

  const pageResults: PaperPageOcrResult[] = []
  for (const entry of readdirSync(normalizedDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    try {
      const content = readFileSync(join(normalizedDir, entry.name), 'utf-8')
      pageResults.push(JSON.parse(content) as PaperPageOcrResult)
    } catch {
      // Ignore malformed legacy pages; callers will handle normal read errors separately.
    }
  }

  return createLocalAssetReplacementMap(paperId, pageResults)
}

function localizeTextValue(
  content: string | undefined,
  replacements: Map<string, string>
): { value?: string; changed: boolean } {
  if (typeof content !== 'string' || replacements.size === 0) {
    return { value: content, changed: false }
  }

  let nextContent = content
  for (const [remoteUrl, localRelativePath] of replacements) {
    nextContent = replaceAllLiteral(nextContent, remoteUrl, localRelativePath)
  }

  return {
    value: nextContent,
    changed: nextContent !== content
  }
}

function localizeMarkdownValue(
  content: string | undefined,
  replacements: Map<string, string>
): { value?: string; changed: boolean } {
  if (typeof content !== 'string' || replacements.size === 0) {
    return { value: content, changed: false }
  }

  let nextContent = content
  for (const [remoteUrl, localRelativePath] of replacements) {
    nextContent = localizeRemoteAssetReferences(nextContent, remoteUrl, localRelativePath)
  }

  return {
    value: nextContent,
    changed: nextContent !== content
  }
}

function localizeTranslationEntry(
  entry: PaperTranslationEntry,
  replacements: Map<string, string>
): { entry: PaperTranslationEntry; changed: boolean } {
  let changed = false
  const originalMarkdown = localizeMarkdownValue(entry.originalMarkdown, replacements)
  const originalText = localizeTextValue(entry.originalText, replacements)
  const translatedMarkdown = localizeMarkdownValue(entry.translatedMarkdown, replacements)
  const translatedText = localizeTextValue(entry.translatedText, replacements)

  changed =
    originalMarkdown.changed ||
    originalText.changed ||
    translatedMarkdown.changed ||
    translatedText.changed

  if (!changed) {
    return { entry, changed: false }
  }

  return {
    entry: {
      ...entry,
      originalMarkdown: originalMarkdown.value ?? entry.originalMarkdown,
      originalText: originalText.value ?? entry.originalText,
      translatedMarkdown: translatedMarkdown.value,
      translatedText: translatedText.value
    },
    changed: true
  }
}

export function localizePaperTranslationCacheAssets(
  cache: PaperTranslationCache,
  replacements: Map<string, string>
): { cache: PaperTranslationCache; changed: boolean } {
  if (replacements.size === 0) {
    return { cache, changed: false }
  }

  let changed = false
  const entries = cache.entries.map((entry) => {
    const result = localizeTranslationEntry(entry, replacements)
    changed = changed || result.changed
    return result.entry
  })

  if (!changed) {
    return { cache, changed: false }
  }

  return {
    cache: {
      ...cache,
      entries
    },
    changed: true
  }
}
