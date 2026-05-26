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
  assert.equal(normalizeThemeId('lumina-light'), 'lumina-light')
})

test('normalizeThemeMode falls back to manual mode', () => {
  assert.equal(normalizeThemeMode(undefined), DEFAULT_THEME_MODE)
  assert.equal(normalizeThemeMode('manual'), 'manual')
  assert.equal(normalizeThemeMode('system'), 'system')
})

test('resolveThemeFromSystem maps operating system theme to app theme', () => {
  assert.equal(resolveThemeFromSystem('dark'), 'lumina-dark')
  assert.equal(resolveThemeFromSystem('light'), 'lumina-light')
})

test('resolveEffectiveTheme follows system only in system mode', () => {
  assert.equal(resolveEffectiveTheme('manual', 'lumina-dark', 'light'), 'lumina-dark')
  assert.equal(resolveEffectiveTheme('manual', 'lumina-light', 'dark'), 'lumina-light')
  assert.equal(resolveEffectiveTheme('system', 'lumina-dark', 'light'), 'lumina-light')
  assert.equal(resolveEffectiveTheme('system', 'lumina-light', 'dark'), 'lumina-dark')
})

test('resolveNativeThemeSource returns system source only in auto mode', () => {
  assert.equal(resolveNativeThemeSource('system', 'lumina-dark'), 'system')
  assert.equal(resolveNativeThemeSource('manual', 'lumina-dark'), 'dark')
  assert.equal(resolveNativeThemeSource('manual', 'lumina-light'), 'light')
})

test('getThemeBackgroundColor returns stable startup background colors', () => {
  assert.equal(getThemeBackgroundColor('lumina-dark'), '#121212')
  assert.equal(getThemeBackgroundColor('lumina-light'), '#f5f5f7')
})
