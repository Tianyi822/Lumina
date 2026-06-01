/* eslint-disable no-misleading-character-class */
const INVISIBLE_FORMAT_CHARACTER_PATTERN =
  /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/
const INVISIBLE_FORMAT_CHARACTERS_PATTERN =
  /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g
/* eslint-enable no-misleading-character-class */

function clampOffset(offset: number, length: number): number {
  return Math.max(0, Math.min(length, offset))
}

export function isInvisibleFormatCharacter(character: string): boolean {
  return INVISIBLE_FORMAT_CHARACTER_PATTERN.test(character)
}

export function isIgnorableTextBoundaryCharacter(character: string): boolean {
  return /\s/.test(character) || isInvisibleFormatCharacter(character)
}

export function removeInvisibleFormatCharacters(text: string): string {
  return text.replace(INVISIBLE_FORMAT_CHARACTERS_PATTERN, '')
}

export function trimTextBoundaryRange(
  text: string,
  startOffset: number,
  endOffset: number
): { startOffset: number; endOffset: number } | null {
  let nextStartOffset = clampOffset(startOffset, text.length)
  let nextEndOffset = clampOffset(endOffset, text.length)

  while (
    nextStartOffset < nextEndOffset &&
    isIgnorableTextBoundaryCharacter(text[nextStartOffset])
  ) {
    nextStartOffset += 1
  }

  while (
    nextEndOffset > nextStartOffset &&
    isIgnorableTextBoundaryCharacter(text[nextEndOffset - 1])
  ) {
    nextEndOffset -= 1
  }

  if (nextStartOffset >= nextEndOffset) {
    return null
  }

  return {
    startOffset: nextStartOffset,
    endOffset: nextEndOffset
  }
}
