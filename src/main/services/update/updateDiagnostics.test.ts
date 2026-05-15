import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyUpdateError,
  configurePlatformUpdateChannel,
  hasAvailableUpdate
} from './updateDiagnostics'

test('Windows 更新通道使用 latest-win 并关闭降级', () => {
  const updater = {
    channel: null,
    allowDowngrade: true
  }

  configurePlatformUpdateChannel(updater, 'win32')

  assert.equal(updater.channel, 'latest-win')
  assert.equal(updater.allowDowngrade, false)
})

test('非 Windows 平台保持默认更新通道', () => {
  const updater = {
    channel: null,
    allowDowngrade: false
  }

  configurePlatformUpdateChannel(updater, 'darwin')

  assert.equal(updater.channel, null)
  assert.equal(updater.allowDowngrade, false)
})

test('缺少 latest-win.yml 映射为 metadata-missing', () => {
  const diagnostic = classifyUpdateError(
    'Cannot find latest-win.yml in the latest release artifacts (https://example.com/latest-win.yml): HttpError: 404'
  )

  assert.equal(diagnostic.diagnosticCode, 'metadata-missing')
  assert.match(diagnostic.message, /latest-win\.yml/)
})

test('缺少 latest-mac.yml 映射为 metadata-missing', () => {
  const diagnostic = classifyUpdateError(
    'Cannot find latest-mac.yml in the latest release artifacts (https://example.com/latest-mac.yml): HttpError: 404'
  )

  assert.equal(diagnostic.diagnosticCode, 'metadata-missing')
  assert.match(diagnostic.message, /latest-mac\.yml/)
})

test('缺少安装包资源映射为 asset-missing', () => {
  const diagnostic = classifyUpdateError('Cannot find asset "lumina-1.2.0-x64-setup.exe" in: []')

  assert.equal(diagnostic.diagnosticCode, 'asset-missing')
})

test('仅 isUpdateAvailable 为 true 时判断为有更新', () => {
  assert.equal(hasAvailableUpdate({ isUpdateAvailable: true }), true)
  assert.equal(hasAvailableUpdate({ isUpdateAvailable: false }), false)
  assert.equal(hasAvailableUpdate({}), false)
  assert.equal(hasAvailableUpdate(null), false)
})
