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

## [1.5.5] - 2026-07-28

### Added

- Codex 任务支持在 macOS 锁屏后自动监控，并通过明确绑定的飞书 P2P 单聊推送关键进展、完成、失败、停滞和待处理状态；亮屏、解锁或系统恢复后自动暂停，通知默认关闭且应用重启后继续去重。

### Changed

### Fixed

### Refactored

### Docs

### Build

## [1.5.4] - 2026-07-25

### Added

### Changed

- 飞书群聊默认接收未 `@` 机器人的普通消息和附件，并继续按机器人配置与 `chat_id` 隔离 Codex 会话；消息存在明确提及时，仍只由被点名的机器人响应。

### Fixed

### Refactored

### Docs

### Build

## [1.5.3] - 2026-07-24

### Added

- Codex 飞书会话支持接收图片和文件消息；私聊附件可直接触发任务，群聊可通过回复附件并明确 `@` 当前机器人处理，图片会以 `localImage` 交给 Codex。
- Codex 可通过每轮隔离的安全 `outbox` 向飞书回复图片和文件，输出路径会校验目录边界、符号链接、数量与大小。

### Changed

### Fixed

- 修复飞书必须等待整轮 Codex 任务结束且只能收到最后一条回复的问题；现在每条 Codex 消息完成后会立即按顺序回传，整轮结束时仅补发尚未成功送达的内容。

### Refactored

### Docs

### Build

## [1.5.2] - 2026-07-24

### Added

- 飞书收到允许执行的指令后，会在原消息上添加“敲键盘”表情作为链路与处理状态反馈，并在结果回传后自动撤回。

### Changed

- 项目流水线适配 GitHub Actions：优先识别 GitHub remote，支持 SSH URL 与 GitHub Enterprise，并在未单独配置 Token 时复用本机 `gh` 登录；列表突出工作流、分支或标签和运行编号，任务可直接用系统浏览器打开，同时放宽前台运行与空闲状态下的轮询间隔。

### Fixed

- 修复同一飞书群内多个机器人只要消息包含任意 `@` 就会同时响应的问题；每个连接会读取自身机器人 `open_id`，群消息仅在明确提及当前机器人时进入对应 Codex 会话。
- 为飞书长连接补充心跳失活超时，收不到 pong 或其他服务端消息时主动断开并进入 SDK 自动重连。
- 修复 GitHub 仓库会先误入 GitLab 流水线解析、匿名 Actions API 额度容易耗尽，以及 GitHub 运行列表显示内部大 ID、版本标签被标成分支的问题。

### Refactored

### Docs

### Build

## [1.5.1] - 2026-07-24

### Added

- 新增可恢复的 Codex 会话页面，复用本机 Codex 的 ChatGPT 订阅登录，支持左侧多会话列表、独立持久上下文、任务队列、工作目录与权限配置。
- 新增多飞书机器人长连接配置，可分别设置名称、凭据和白名单；不同机器人及 chat_id 使用独立 Codex 会话，最终回答不加包装直接回传飞书。

### Changed

- 重构 Codex 页面视觉层级：会话导航、聊天工作区与设置抽屉分区展示，多飞书机器人使用可折叠配置卡片，并补齐键盘焦点、减少动画等可访问性细节。

### Fixed

- 补齐 Codex 会话删除入口和二次确认，删除时同步清理对应 thread 与本地持久状态；主会话支持清空上下文，执行中或排队中的会话禁止误删。

### Refactored

### Docs

### Build

- Windows 发布构建固定使用 `windows-2022`，避免 `windows-latest` 迁移到 Visual Studio 2026 后原生依赖无法编译。

## [1.5.0] - 2026-07-24

### Added

### Changed

- 项目入口收敛为侧边栏打开的原生工作区标签，支持多个项目同时打开；网页链接统一由系统默认浏览器打开。
- 工作区标签栏右侧菜单保留远端仓库、灵动终端、分屏终端和备份管理入口，并将皮肤切换迁移为独立工作区页面。
- 恢复上次打开的项目与工具页面及当前激活标签，并兼容迁移旧版本保存的原生页面标签。
- 远端仓库页面改用全局主题语义色，侧栏、表单、仓库卡片、状态与交互反馈可随皮肤同步切换。
- 补齐克隆进度弹窗、独立终端、分屏终端及项目详情子页面的皮肤适配，搜索、状态、差异标记和弹窗反馈随主题同步更新。

### Fixed

- 修复 Codex 长输出终端在收放左侧栏、连续拖动宽度时不能实时稳定保持贴底的问题。
- 恢复原有圆角块状标签样式，避免工作区重构后标签栏视觉和交互发生无关变化。

### Refactored

- 移除网页浏览器及其网页标签、地址栏、工具栏、收藏、浏览历史、密码、下载、站点权限、扩展和首页壁纸。
- 移除运行时诊断入口与 OpenGit 内置 MCP 服务、配置和接口。

### Docs

### Build

## [1.4.9] - 2026-07-24

### Added

### Changed

### Fixed

- 修复 Codex 会话列表仍显示已归档、已删除或非交互线程的问题，并按最新 app-server 协议读取详情及执行重命名、归档和删除。
- 修复 Codex app-server 查询失败时回退旧状态库，导致已归档或已删除会话重新出现的问题。
- 修复 macOS 发布版启动 Codex app-server 时找不到 NVM Node 运行时的问题。

### Refactored

### Docs

### Build

## [1.4.7] - 2026-05-31

### Added

### Changed

### Fixed

- 修复 Codex 状态判断不稳定的问题，包括结束日志时间戳归一化错误、`/status` 等本地 slash 命令后的状态漂移，以及同一时刻的真实结束信号未能覆盖本地进行中状态的问题。

### Refactored

### Docs

### Build

## [1.4.6] - 2026-05-31

### Added

- 工作区文本预览支持直接编辑、未保存状态提示，以及 `Cmd/Ctrl+S` 保存到原文件。
- 工作区搜索支持同时匹配文件名和文本文件内容。

### Changed

### Fixed

- 修复悬浮项目侧边栏打开时，内置浏览器原生网页层压住侧边栏的问题。
- 修复终端区域在关闭分屏、项目导航收起/展开等布局变化后，Codex 长输出会停在顶部而不是保持贴底的问题。
- 修复浏览器标签切回项目终端页时，终端没有自动聚焦导致不能直接输入的问题。

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
