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

## [1.4.4] - 2026-05-17

### Added

### Changed

- 调整 Codex 状态展示范围，终端状态改为显示在分屏 pane 顶栏和灵动终端 pane 顶栏，不再显示在终端 tab 上。
- 对齐 Codex 会话记录来源与展示规则，优先按活跃会话展示，归档与孤儿线程过滤逻辑改为更接近 Codex App。

### Fixed

- 修复 Codex 会话在同一内部终端继续对话时，`running` 状态恢复过慢或掉成 `unknown` 后不能及时回来的问题。
- 修复灵动终端 pane 顶栏 `running` 指示不转、主题外观读取报错，以及相关状态映射不稳定的问题。

### Refactored

### Docs

### Build

## [1.4.3] - 2026-05-16

### Added

- 新增 Codex 会话状态监控，可在项目 tab 和项目导航里同步显示运行中、等待确认和已结束状态。
- 新增 Codex 状态通知点击跳转能力，可自动定位到对应项目并切换到终端页。
- 新增项目列表侧边栏悬浮抽屉模式，支持默认悬浮、点击外部收起和固定占位切换。

### Changed

- 优化 Codex 会话状态识别与样式表现，改进运行中指示、等待确认提示和结束状态保留策略。
- 优化项目侧边栏交互，加入 rail 入口、抽屉位移动画和固定/取消固定切换。

### Fixed

- 修复 Codex 会话结束后继续在同一终端对话时，状态无法重新恢复的问题。
- 修复退出应用或终端输出回调期间可能触发的 Codex 会话监控主进程异常。

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
