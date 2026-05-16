# OpenGit Agent Guide

## Scope

This repository is `OpenGit`, an Electron + Vue 3 desktop application for Git workflows, built-in browser/terminal tooling, and project-scoped AI sessions.

Agents working in this repo should optimize for stable desktop behavior first. Avoid broad refactors unless the user explicitly asks for them.

## Stack

- Renderer: Vue 3 + Vite
- Desktop shell: Electron
- Terminal: `node-pty` + `xterm`
- Packaging: `electron-builder`

## Working Rules

1. Prefer narrow fixes over large architectural rewrites.
2. When touching browser, terminal, or Electron integration, preserve existing lifecycle behavior unless the bug requires changing it.
3. For user-visible changes, add a short entry to `CHANGELOG.md` under `## [Unreleased]`.
4. For release-oriented changes, keep these three values aligned:
   - `package.json` version
   - `CHANGELOG.md` release section
   - Git tag in the form `vX.Y.Z`
5. Before claiming a release is ready, make sure the changelog has been promoted from `Unreleased` to the target version.

## Changelog Rules

Use these sections under `## [Unreleased]` when they apply:

- `### Added`
- `### Changed`
- `### Fixed`
- `### Refactored`
- `### Docs`
- `### Build`

Write concise bullets from the user or release perspective, not low-level implementation trivia.

Good:

- `- 修复浏览器标签切回时网页内容被遮罩层隐藏的问题`

Bad:

- `- 调整 Browser.vue 第 3 个 watcher`

## Release Workflow

During normal work:

1. Add changelog bullets into `CHANGELOG.md` under `## [Unreleased]`.

Before local build or tagging a release:

1. Run `npm run release:prepare -- 1.4.2`
2. Review the updated `package.json` and `CHANGELOG.md`
3. Build with the existing release scripts
4. Commit the release metadata
5. Create tag `v1.4.2`

Useful commands:

```bash
npm run release:prepare -- 1.4.2
npm run release:notes -- 1.4.2
```

## Verification

- Renderer/UI changes: `npm run build`
- Release metadata changes: verify `package.json` version and matching `CHANGELOG.md` section
- Packaging changes: run the corresponding `release` or `electron:build:*` script only when needed
