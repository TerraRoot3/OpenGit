import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const packagePath = process.env.PACKAGE_PATH || path.join(repoRoot, 'package.json')
const changelogPath = process.env.CHANGELOG_PATH || path.join(repoRoot, 'CHANGELOG.md')

const usage = `
Usage:
  node scripts/release-manager.mjs prepare <version>
  node scripts/release-manager.mjs notes <version>
`

function fail(message) {
  console.error(message)
  process.exit(1)
}

function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version || '')) {
    fail(`Invalid version: ${version}`)
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8')
}

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getVersionHeaderPattern(version) {
  return new RegExp(String.raw`^## \[${escapeRegex(version)}\](?: - .*)?$`, 'm')
}

function parseSections(content) {
  const unreleasedMatch = content.match(/^## \[Unreleased\]$/m)
  if (!unreleasedMatch || unreleasedMatch.index == null) {
    fail('CHANGELOG.md is missing "## [Unreleased]"')
  }

  const unreleasedHeader = unreleasedMatch[0]
  const unreleasedIndex = unreleasedMatch.index
  const afterUnreleased = content.slice(unreleasedIndex + unreleasedHeader.length)
  const nextSectionMatch = afterUnreleased.match(/^## \[[^\n]+\](?: - .*)?$/m)
  const unreleasedBodyEnd = !nextSectionMatch || nextSectionMatch.index == null
    ? content.length
    : unreleasedIndex + unreleasedHeader.length + nextSectionMatch.index

  const unreleasedBody = content.slice(unreleasedIndex + unreleasedHeader.length, unreleasedBodyEnd)
  return {
    unreleasedHeader,
    unreleasedIndex,
    unreleasedBody,
    unreleasedBodyEnd
  }
}

function hasMeaningfulEntries(sectionBody) {
  const lines = sectionBody
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.some((line) => !line.startsWith('### '))
}

function extractVersionSection(content, version) {
  const versionPattern = getVersionHeaderPattern(version)
  const match = content.match(versionPattern)
  if (!match || match.index == null) {
    fail(`CHANGELOG.md does not contain section for version ${version}`)
  }

  const header = match[0]
  const start = match.index
  const remaining = content.slice(start + header.length)
  const nextSectionMatch = remaining.match(/^## \[[^\n]+\](?: - .*)?$/m)
  const end = !nextSectionMatch || nextSectionMatch.index == null
    ? content.length
    : start + header.length + nextSectionMatch.index

  const section = content.slice(start, end).trim()
  return section
}

function prepareRelease(version) {
  validateVersion(version)

  const packageJson = JSON.parse(readText(packagePath))
  const changelog = readText(changelogPath)
  const { unreleasedHeader, unreleasedIndex, unreleasedBody, unreleasedBodyEnd } = parseSections(changelog)

  if (getVersionHeaderPattern(version).test(changelog)) {
    fail(`CHANGELOG.md already contains version ${version}`)
  }

  if (!hasMeaningfulEntries(unreleasedBody)) {
    fail('Unreleased changelog has no entries to release')
  }

  const releaseBody = unreleasedBody.trim()
  const releaseSection = `## [${version}] - ${getToday()}\n\n${releaseBody}\n\n`
  const resetUnreleased = `${unreleasedHeader}\n\n### Added\n\n### Changed\n\n### Fixed\n\n### Refactored\n\n### Docs\n\n### Build\n\n`

  const nextContent =
    changelog.slice(0, unreleasedIndex) +
    resetUnreleased +
    releaseSection +
    changelog.slice(unreleasedBodyEnd).replace(/^\n+/, '')

  packageJson.version = version

  writeText(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  writeText(changelogPath, nextContent)

  console.log(`Prepared release ${version}`)
  console.log(`Updated: ${path.relative(repoRoot, packagePath)}`)
  console.log(`Updated: ${path.relative(repoRoot, changelogPath)}`)
}

function printReleaseNotes(version) {
  validateVersion(version)
  const changelog = readText(changelogPath)
  const section = extractVersionSection(changelog, version)
  const lines = section.split('\n')
  lines.shift()
  process.stdout.write(`${lines.join('\n').trim()}\n`)
}

const [, , command, version] = process.argv

if (!command || !version) {
  fail(usage.trim())
}

if (command === 'prepare') {
  prepareRelease(version)
} else if (command === 'notes') {
  printReleaseNotes(version)
} else {
  fail(usage.trim())
}
