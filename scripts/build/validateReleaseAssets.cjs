/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */

const fs = require('fs')
const path = require('path')

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function collectRefs(content) {
  return [...content.matchAll(/^\s*(?:url|path):\s*['"]?([^'"\r\n#]+)['"]?\s*$/gm)]
    .map((match) => match[1].trim())
    .filter((value) => value && !/^https?:\/\//i.test(value))
}

function validateReleaseAssets(dir) {
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  const errors = []
  const exists = (name) => fs.existsSync(path.join(dir, name))
  const requireFile = (name) => {
    if (!exists(name)) {
      errors.push(`Missing ${name}`)
    }
  }
  const requireMatch = (pattern, label) => {
    if (!entries.some((name) => pattern.test(name))) {
      errors.push(`Missing ${label}`)
    }
  }
  const validateRefs = (name, platformPattern) => {
    if (!exists(name)) {
      return
    }

    for (const ref of collectRefs(readFile(path.join(dir, name)))) {
      if (!exists(ref)) {
        errors.push(`${name} references missing asset ${ref}`)
      }
      if (!platformPattern.test(ref)) {
        errors.push(`${name} references unexpected platform asset ${ref}`)
      }
    }
  }
  requireFile('latest.yml')
  requireFile('latest-win.yml')
  requireMatch(/\.exe$/i, 'Windows installer')
  requireMatch(/\.exe\.blockmap$/i, 'Windows blockmap')
  requireMatch(/\.(?:dmg|pkg)$/i, 'macOS manual installer')

  if (exists('latest.yml') && exists('latest-win.yml')) {
    const latest = readFile(path.join(dir, 'latest.yml'))
    const latestWin = readFile(path.join(dir, 'latest-win.yml'))
    if (latest !== latestWin) {
      errors.push('latest.yml and latest-win.yml must be identical')
    }
  }

  validateRefs('latest.yml', /\.(exe|exe\.blockmap)$/i)
  validateRefs('latest-win.yml', /\.(exe|exe\.blockmap)$/i)
  validateRefs('latest-mac.yml', /\.(dmg|zip|dmg\.blockmap|zip\.blockmap)$/i)

  return errors
}

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || 'release-assets')
  const errors = validateReleaseAssets(dir)

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error)
    }
    process.exit(1)
  }

  console.log(`Validated release assets: ${fs.readdirSync(dir).join(', ')}`)
}

module.exports = {
  validateReleaseAssets
}
