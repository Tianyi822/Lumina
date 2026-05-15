/* eslint-disable @typescript-eslint/explicit-function-return-type */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { validateReleaseAssets } = require('./validateReleaseAssets.cjs')

function createAssetDir(latestMacContent, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-release-assets-'))
  const windowsMetadata = [
    'version: 1.2.2',
    'files:',
    '  - url: lumina-1.2.2-arm64-setup.exe',
    'path: lumina-1.2.2-arm64-setup.exe',
    'sha512: test'
  ].join('\n')
  const files = {
    'latest.yml': windowsMetadata,
    'latest-win.yml': windowsMetadata,
    'latest-mac.yml': latestMacContent,
    'lumina-1.2.2-arm64-setup.exe': '',
    'lumina-1.2.2-arm64-setup.exe.blockmap': '',
    'lumina-1.2.2.dmg': '',
    'lumina-1.2.2.dmg.blockmap': '',
    'lumina-1.2.2.zip': '',
    'lumina-1.2.2.zip.blockmap': '',
    ...overrides
  }

  for (const [name, content] of Object.entries(files)) {
    if (content === null) {
      continue
    }
    fs.writeFileSync(path.join(dir, name), content)
  }

  return dir
}

test('Release 资产校验接受 macOS 手动安装包', () => {
  const dir = createAssetDir(
    [
      'version: 1.2.2',
      'files:',
      '  - url: lumina-1.2.2.dmg',
      'path: lumina-1.2.2.dmg',
      'sha512: test'
    ].join('\n'),
    {
      'lumina-1.2.2.zip': null,
      'lumina-1.2.2.zip.blockmap': null
    }
  )

  assert.deepEqual(validateReleaseAssets(dir), [])
})

test('Release 资产校验拒绝缺少 macOS 手动安装包', () => {
  const dir = createAssetDir(
    ['version: 1.2.2', 'files:', 'path: lumina-1.2.2.dmg', 'sha512: test'].join('\n'),
    {
      'lumina-1.2.2.dmg': null,
      'lumina-1.2.2.zip': null
    }
  )

  assert(validateReleaseAssets(dir).some((error) => error.includes('macOS manual installer')))
})
