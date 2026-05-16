# Codex 终端会话状态监控 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 OpenGit 内部终端里的 Codex 会话增加状态监控，并把状态同步到 browser 项目 tab、`ProjectDetail` 左侧终端入口和系统通知。

**Architecture:** 在 Electron 主进程新增一层 `codex session monitor`，基于 terminal runtime 生命周期和终端输出 ring buffer 维护 `terminalId -> codexState` 与 `projectPath -> projectCodexState`。渲染层通过 preload 读取快照并订阅变化，只负责展示；系统通知也从主进程发出。

**Tech Stack:** Electron 主进程 IPC、现有 `terminal-runtime` 和 `terminalBuffers`、Vue 3、Pinia/现有浏览器 tab 状态、系统通知 API

---

### Task 1: 定义 Codex 状态模型与模式匹配

**Files:**
- Create: `electron/ipc/codex-session-types.js`
- Create: `electron/ipc/codex-session-patterns.js`

**Step 1: 定义状态常量**

导出统一状态：
- `running`
- `awaiting_confirmation`
- `ended`
- `unknown`

并定义项目级聚合优先级。

**Step 2: 定义确认态 pattern 列表**

集中维护用于识别“等待确认”的输出模式，不把正则和字符串散落在 monitor 或 UI 组件里。

**Step 3: 定义公共辅助函数**

增加：
- `isCodexLaunchText(text)`
- `matchesCodexConfirmation(text)`

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

### Task 2: 在主进程新增 Codex session monitor

**Files:**
- Create: `electron/ipc/codex-session-monitor.js`
- Modify: `electron/ipc/terminal-runtime.js`
- Modify: `electron/ipc/terminal.js`

**Step 1: 建立 monitor 内部状态表**

维护：
- `terminalId -> monitorState`
- `projectPath -> aggregatedState`

`monitorState` 至少包含：
- `terminalId`
- `projectPath`
- `isCodexSession`
- `state`
- `lastOutputAt`
- `lastStateChangedAt`
- `lastNotificationState`

**Step 2: 接入终端注册与销毁事件**

在 terminal runtime 注册/移除 session 时同步更新 monitor。

**Step 3: 接入终端输出事件**

在 `terminal-output` 路径里把输出片段喂给 monitor，用于：
- 首次识别 Codex 会话
- 更新 `awaiting_confirmation`
- 保持 `running`

**Step 4: 接入终端写入路径**

当 OpenGit 往终端写入命令时，如果文本命中 `codex`，标记这个 terminal 为 Codex 候选会话。

**Step 5: 接入终端退出路径**

当 terminal session 退出时，如果它是 Codex 会话，则切到 `ended`。

**Step 6: 验证**

Run: `npm run build`
Expected: PASS

### Task 3: 实现项目级状态聚合

**Files:**
- Modify: `electron/ipc/codex-session-monitor.js`

**Step 1: 实现聚合函数**

按优先级聚合项目状态：
- `awaiting_confirmation`
- `running`
- `ended`
- `unknown`

**Step 2: 仅对已识别 Codex 会话聚合**

普通终端、未知终端不应把项目状态错误抬高。

**Step 3: 支持空状态清理**

当一个项目下没有任何 Codex 会话时，移除该项目聚合状态。

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

### Task 4: 新增主进程通知规则

**Files:**
- Modify: `electron/ipc/codex-session-monitor.js`
- Modify: `electron/main.js`

**Step 1: 获取窗口可见性信息**

复用主窗口状态，判断：
- 应用是否在后台
- 当前活动项目路径是什么

**Step 2: 只在目标状态变化时通知**

仅对：
- `awaiting_confirmation`
- `ended`

触发通知。

**Step 3: 增加可见性抑制**

满足任一条件才通知：
- 应用在后台
- 应用在前台但当前项目不在可见页

**Step 4: 阻止重复通知**

同一 terminal/session 连续命中同一状态时不重复通知，直到状态真正变化。

**Step 5: 验证**

Run: `npm run build`
Expected: PASS

### Task 5: 暴露 Codex 状态 IPC 与订阅接口

**Files:**
- Modify: `electron/preload.js`
- Modify: `electron/main.js`

**Step 1: 暴露快照读取接口**

增加例如：
- `getCodexSessionStates()`
- `getProjectCodexStates()`

**Step 2: 暴露状态变更订阅接口**

增加例如：
- `onCodexSessionStateChanged`
- `onProjectCodexStateChanged`

**Step 3: 统一事件 payload**

返回结构至少包含：
- `projectPath`
- `terminalId`
- `state`
- `updatedAt`

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

### Task 6: 在 Browser 项目 tab 上显示状态

**Files:**
- Modify: `src/components/browser/Browser.vue`

**Step 1: 读取项目级 Codex 状态**

在 browser 层订阅主进程状态快照和变更。

**Step 2: 只对项目 tab 展示状态**

普通网页 tab、不关联项目的 tab 不展示。

**Step 3: 增加轻量视觉标识**

第一版只加小点或小图标，不加文字：
- `running`
- `awaiting_confirmation`
- `ended`

`unknown` 不展示。

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

### Task 7: 在 ProjectDetail 左侧终端入口显示状态

**Files:**
- Modify: `src/components/git/ProjectDetail.vue`

**Step 1: 读取当前项目的 Codex 聚合状态**

为当前 `props.path` 订阅项目级状态。

**Step 2: 在终端入口右侧增加状态点或 badge**

只展示：
- `running`
- `awaiting_confirmation`
- `ended`

**Step 3: 目录模式兼容**

非 Git 目录的 `ProjectDetail` 也可能有内部终端，因此目录模式下同样要显示终端状态。

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

### Task 8: 为 monitor 增加轻量调试和诊断输出

**Files:**
- Modify: `src/components/HomePage.vue`
- Modify: `electron/main.js`
- Modify: `electron/ipc/codex-session-monitor.js`

**Step 1: 在现有诊断数据里补 Codex monitor 指标**

增加例如：
- `codexSessions`
- `codexProjects`
- `awaitingConfirmationCount`

**Step 2: 让诊断面板能看到当前状态快照**

方便验证状态识别是否符合预期。

**Step 3: 验证**

Run: `npm run build`
Expected: PASS

### Task 9: 手工验证状态流转

**Files:**
- No code changes required

**Step 1: 验证运行中状态**

在内部终端启动 Codex，会看到：
- browser 项目 tab 状态更新
- `ProjectDetail` 左侧终端状态更新

**Step 2: 验证等待确认状态**

让 Codex 进入确认态，检查：
- 状态是否切到 `awaiting_confirmation`
- 当前项目不可见时是否收到通知

**Step 3: 验证结束状态**

结束一次 Codex 会话，检查：
- 状态是否切到 `ended`
- 当前项目不可见时是否收到通知

**Step 4: 验证普通终端不误报**

在普通 shell 里运行：
- `node`
- `python`
- 普通命令

确认不会出现 Codex 状态。

**Step 5: 最终验证**

Run: `npm run build`
Expected: PASS

### Task 10: 文档更新

**Files:**
- Modify: `README.md`
- Modify: `docs/mcp/opengit-embedded-mcp.md` (only if MCP-facing diagnostics or future hooks need mention)

**Step 1: 更新 README 能力说明**

补一句 OpenGit 现在支持内部 Codex 会话状态同步和通知。

**Step 2: 若调试接口对外可见，再补文档**

如果新增的诊断接口会影响外部接入说明，再同步更新文档；否则保持 MCP 文档不动。

**Step 3: 验证**

Run: `git diff --check`
Expected: PASS
