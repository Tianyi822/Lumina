import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  getThemeBackgroundColor,
  normalizeThemeId,
  normalizeThemeMode,
  resolveEffectiveTheme,
  resolveNativeThemeSource,
  resolveThemeFromSystem
} from './theme.ts'

test('normalizeThemeId returns default theme for invalid input', () => {
  assert.equal(normalizeThemeId('unknown-theme'), DEFAULT_THEME_ID)
  assert.equal(normalizeThemeId(undefined), DEFAULT_THEME_ID)
  assert.equal(normalizeThemeId('sparrow-light'), 'sparrow-light')
})

test('normalizeThemeMode falls back to manual mode', () => {
  assert.equal(normalizeThemeMode(undefined), DEFAULT_THEME_MODE)
  assert.equal(normalizeThemeMode('manual'), 'manual')
  assert.equal(normalizeThemeMode('system'), 'system')
})

test('resolveThemeFromSystem maps operating system theme to app theme', () => {
  assert.equal(resolveThemeFromSystem('dark'), 'sparrow-dark')
  assert.equal(resolveThemeFromSystem('light'), 'sparrow-light')
})

test('resolveEffectiveTheme follows system only in system mode', () => {
  assert.equal(resolveEffectiveTheme('manual', 'sparrow-dark', 'light'), 'sparrow-dark')
  assert.equal(resolveEffectiveTheme('manual', 'sparrow-light', 'dark'), 'sparrow-light')
  assert.equal(resolveEffectiveTheme('system', 'sparrow-dark', 'light'), 'sparrow-light')
  assert.equal(resolveEffectiveTheme('system', 'sparrow-light', 'dark'), 'sparrow-dark')
})

test('resolveNativeThemeSource returns system source only in auto mode', () => {
  assert.equal(resolveNativeThemeSource('system', 'sparrow-dark'), 'system')
  assert.equal(resolveNativeThemeSource('manual', 'sparrow-dark'), 'dark')
  assert.equal(resolveNativeThemeSource('manual', 'sparrow-light'), 'light')
})

test('getThemeBackgroundColor returns stable startup background colors', () => {
  assert.equal(getThemeBackgroundColor('sparrow-dark'), '#121212')
  assert.equal(getThemeBackgroundColor('sparrow-light'), '#f5f5f7')
})
