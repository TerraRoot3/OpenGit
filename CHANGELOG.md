# Changelog

This project keeps a structured changelog for release preparation, local builds, and Git tags.

From this file onward:

- daily changes are added under `## [Unreleased]`
- release preparation promotes `Unreleased` into a concrete version section
- the released version should match `package.json` and tag `vX.Y.Z`

## [Unreleased]

### Added

### Changed

### Fixed

### Refactored

### Docs

### Build

## [1.4.2] - 2026-05-16

### Added

- 新增项目根目录 `AGENT.md`，约束 agent 在 OpenGit 中的工作方式与发布流程。

### Changed

### Fixed

- 修复内置浏览器标签切换时，网页内容可能被遮罩层错误隐藏的问题。

### Refactored

### Docs

- 新增根目录 `CHANGELOG.md` 并补充 README 中的版本维护与发版步骤。

### Build

- 新增 `scripts/release-manager.mjs` 以及 `npm run release:prepare`、`npm run release:notes`，用于同步版本号与 changelog。

## [Historical]

- Existing tags up to `v1.4.1` were created before this changelog was introduced and have not been backfilled here.
