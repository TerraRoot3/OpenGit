# OpenGit Embedded MCP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 OpenGit 主进程内置一个只监听本机的 MCP Server，对外提供项目发现、终端日志读取、远端平台只读查询能力。

**Architecture:** 复用现有 Electron 主进程里的项目扫描、终端会话和 GitLab/GitHub/Gitee 服务能力，在 `electron/mcp` 下新增独立的 MCP server、tools 和 service 层。第一版只做只读能力，避免直接暴露凭据或任意命令执行。终端日志通过主进程 ring buffer 聚合，项目能力通过侧栏/store/tab 状态统一整合，远端平台能力通过高层封装复用 `scm.js` 里的 provider 逻辑。

**Tech Stack:** Electron main process, Node.js, existing IPC/service modules, MCP server runtime, Vue settings UI

---

### Task 1: 梳理并固定 MCP 配置入口

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/components/HomePage.vue`
- Create: `electron/mcp/config.js`

**Step 1: 写一个最小失败用例或检查脚本说明配置缺失**

定义要验证的最小行为：
- OpenGit 启动后可以读取 MCP 配置
- 配置包含：
  - `enabled`
  - `host`
  - `port`
  - `capabilities.projects`
  - `capabilities.terminals`
  - `capabilities.remotesRead`

**Step 2: 在主进程新增 MCP 配置读写模块**

在 `electron/mcp/config.js` 中提供：
- `getMcpConfig(store)`
- `saveMcpConfig(store, partial)`
- `getDefaultMcpConfig()`

默认值：
- `enabled: false`
- `host: '127.0.0.1'`
- `port: 3765`
- `capabilities.projects: true`
- `capabilities.terminals: true`
- `capabilities.remotesRead: true`

**Step 3: 通过 preload 暴露配置接口**

新增：
- `window.electronAPI.getMcpConfig()`
- `window.electronAPI.saveMcpConfig(payload)`

**Step 4: 在设置页补 MCP 服务基础开关**

在 `HomePage.vue` 的设置抽屉中新增一个简洁分组：
- 启用开关
- 端口显示/输入
- 三个能力开关

第一版先不做复杂状态面板。

**Step 5: 验证**

Run: `npm run build`
Expected: PASS

**Step 6: Commit**

```bash
git add electron/main.js electron/preload.js electron/mcp/config.js src/components/HomePage.vue
git commit -m "feat: add MCP service configuration"
```

### Task 2: 搭建 MCP Server 骨架

**Files:**
- Create: `electron/mcp/server.js`
- Create: `electron/mcp/schema.js`
- Modify: `electron/main.js`

**Step 1: 定义 server 生命周期接口**

在 `electron/mcp/server.js` 中提供：
- `createEmbeddedMcpServer(deps)`
- `start()`
- `stop()`
- `restart()`
- `getStatus()`

状态至少包括：
- `enabled`
- `running`
- `host`
- `port`
- `startedAt`
- `lastError`

**Step 2: 接入主进程生命周期**

在 `electron/main.js` 中：
- 应用启动后依据配置决定是否启动
- 配置变化后支持重启
- `will-quit` 时停止 MCP server

**Step 3: 定义统一 tool schema 辅助**

在 `electron/mcp/schema.js` 中抽：
- 通用成功返回包装
- 错误返回包装
- 常用输入 schema 片段

避免后续每个 tool 重复写。

**Step 4: 验证**

验证点：
- 不启用时不监听端口
- 启用后 server 状态可读
- 关闭应用时停止 server

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/main.js electron/mcp/server.js electron/mcp/schema.js
git commit -m "feat: scaffold embedded MCP server"
```

### Task 3: 实现项目服务层

**Files:**
- Create: `electron/mcp/services/projects.js`
- Modify: `src/stores/projectStore.js`（如需补只读导出）
- Modify: `src/components/app/AppShell.vue`（仅在必要时补状态访问入口）
- Modify: `src/components/browser/Browser.vue`（仅在必要时补当前 tab 状态访问入口）

**Step 1: 定义项目聚合输出结构**

统一项目对象字段：
- `name`
- `path`
- `type`
- `scanRoot`
- `isFavorite`
- `isOpen`
- `isActive`
- `currentBranch`
- `remoteProvider`
- `originUrl`

**Step 2: 聚合项目来源**

服务层需聚合：
- 已保存目录 roots
- 扫描出的项目树
- 当前打开的项目 tabs
- 当前激活项目
- `projectStore` 中已缓存的 branch/provider 信息

**Step 3: 提供 service 方法**

至少实现：
- `listProjects()`
- `findProjects(query)`
- `getProject(path)`
- `getActiveProject()`
- `getOpenProjectTabs()`

**Step 4: 补边界处理**

要区分：
- Git 仓库
- 非 Git 目录模式
- 项目 tab 已打开但缓存未热
- 收藏目录下无仓库的情况

**Step 5: 验证**

验证点：
- 返回项目路径稳定
- 目录模式项目也能返回
- 当前活动项目解析正确

Run: `npm run build`
Expected: PASS

**Step 6: Commit**

```bash
git add electron/mcp/services/projects.js src/stores/projectStore.js src/components/app/AppShell.vue src/components/browser/Browser.vue
git commit -m "feat: add MCP project discovery service"
```

### Task 4: 暴露项目 MCP tools

**Files:**
- Create: `electron/mcp/tools/projects.js`
- Modify: `electron/mcp/server.js`

**Step 1: 注册只读项目工具**

实现：
- `projects.list`
- `projects.find`
- `projects.get`
- `projects.get_active`
- `projects.get_open_tabs`

**Step 2: 做参数校验**

示例：
- `projects.find` 需要 `query`
- `projects.get` 需要 `path`

路径参数统一归一化，避免不同分隔符问题。

**Step 3: 统一错误输出**

例如：
- 缺少 path
- 项目不存在
- 服务未初始化

**Step 4: 验证**

验证点：
- 工具都能注册成功
- 读取结果结构统一

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/mcp/tools/projects.js electron/mcp/server.js
git commit -m "feat: expose MCP project tools"
```

### Task 5: 为终端增加主进程日志缓冲

**Files:**
- Create: `electron/mcp/services/terminalBuffers.js`
- Modify: `electron/ipc/terminal.js`

**Step 1: 定义 ring buffer 数据结构**

每个 terminal session 维护：
- `terminalId`
- `projectPath`
- `cwd`
- `mode`
- `createdAt`
- `lastOutputAt`
- `lines[]`
- `rawBuffer`

建议限制：
- 最近 `2000` 行
- 最近若干 KB 原始输出

**Step 2: 在终端输出事件里写入缓冲**

在 `terminal.js` 的 `ptyProcess.onData(...)` 中，把输出同步写入 ring buffer。

**Step 3: 维护 terminal 生命周期**

创建时注册：
- 基础元数据

退出时清理：
- terminal 缓冲
- session 索引

**Step 4: 兼容不同终端模式**

至少支持：
- 经典终端
- 灵动终端
- 分屏终端
- 独立终端

**Step 5: 验证**

验证点：
- 新终端创建后可见于缓冲索引
- 输出会被采集
- 终端退出后缓冲被清理

Run: `npm run build`
Expected: PASS

**Step 6: Commit**

```bash
git add electron/ipc/terminal.js electron/mcp/services/terminalBuffers.js
git commit -m "feat: add terminal output buffers for MCP"
```

### Task 6: 实现终端服务层

**Files:**
- Create: `electron/mcp/services/terminals.js`

**Step 1: 定义终端查询方法**

实现：
- `listTerminals()`
- `getTerminalOutput({ terminalId, lines, maxBytes, includeAnsi })`
- `getProjectTerminalOutputs({ projectPath, linesPerTerminal, includeInactive })`
- `getRecentTerminalErrors({ projectPath, limit })`

**Step 2: 做错误提取 heuristics**

基于输出匹配：
- `error`
- `warn`
- `failed`
- `exception`
- `traceback`
- `panic`
- `npm ERR!`

返回上下文片段而不是单行孤立结果。

**Step 3: 统一输出格式**

终端列表项建议字段：
- `terminalId`
- `projectPath`
- `cwd`
- `mode`
- `isActive`
- `lastOutputAt`

**Step 4: 验证**

验证点：
- 能列出终端
- 能按项目聚合输出
- 能提取最近错误

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/mcp/services/terminals.js
git commit -m "feat: add MCP terminal query service"
```

### Task 7: 暴露终端 MCP tools

**Files:**
- Create: `electron/mcp/tools/terminals.js`
- Modify: `electron/mcp/server.js`

**Step 1: 注册终端工具**

实现：
- `terminals.list`
- `terminals.get_output`
- `terminals.get_project_outputs`
- `terminals.get_recent_errors`

**Step 2: 做输入默认值**

例如：
- 默认 `lines=200`
- 默认 `linesPerTerminal=120`
- 默认 `includeAnsi=false`

**Step 3: 控制结果大小**

避免单次返回过大：
- 限制总字符数
- 必要时标记被截断

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/mcp/tools/terminals.js electron/mcp/server.js
git commit -m "feat: expose MCP terminal tools"
```

### Task 8: 实现远端平台服务层

**Files:**
- Create: `electron/mcp/services/remotes.js`
- Modify: `electron/ipc/scm.js`（只在必要时抽复用函数）

**Step 1: 抽 provider 只读 service**

服务层复用现有逻辑，提供：
- `detectProvider(projectPath)`
- `getRepo(projectPath)`
- `listBranches(projectPath)`
- `listMergeRequests(projectPath)`
- `listPullRequests(projectPath)`
- `listPipelines(projectPath, limit)`
- `getPipeline(projectPath, pipelineId)`

**Step 2: 统一 GitLab / GitHub / Gitee 输出**

统一结构至少包含：
- `provider`
- `webUrl`
- `title/name`
- `status`
- `ref`
- `author`
- `updatedAt`

**Step 3: 保持凭据只在内部使用**

service 可以读取 store 中 token，但任何返回值不应暴露 token。

**Step 4: 验证**

验证点：
- GitLab 仓库可读
- GitHub 仓库可读
- Gitee 仓库可读
- 无匹配 provider 时错误可理解

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/mcp/services/remotes.js electron/ipc/scm.js
git commit -m "feat: add MCP remote provider service"
```

### Task 9: 暴露远端平台 MCP tools

**Files:**
- Create: `electron/mcp/tools/remotes.js`
- Modify: `electron/mcp/server.js`

**Step 1: 注册远端只读工具**

实现：
- `remotes.detect_provider`
- `remotes.get_repo`
- `remotes.list_branches`
- `remotes.list_merge_requests`
- `remotes.list_pull_requests`
- `remotes.list_pipelines`
- `remotes.get_pipeline`

**Step 2: 对不适用场景返回明确结果**

例如：
- GitHub 仓库调用 `list_merge_requests`
- GitLab 仓库调用 `list_pull_requests`

应返回平台不支持，而不是模糊失败。

**Step 3: 验证**

Run: `npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/mcp/tools/remotes.js electron/mcp/server.js
git commit -m "feat: expose MCP remote provider tools"
```

### Task 10: 补 MCP 服务状态与诊断

**Files:**
- Modify: `electron/mcp/server.js`
- Modify: `electron/preload.js`
- Modify: `src/components/HomePage.vue`

**Step 1: 暴露状态接口**

新增：
- `getMcpServerStatus()`

返回：
- `enabled`
- `running`
- `host`
- `port`
- `toolCount`
- `lastError`

**Step 2: 设置页显示基础状态**

在 MCP 服务设置区显示：
- 已开启/未开启
- 监听地址
- 已注册工具数
- 最近错误

**Step 3: 验证**

Run: `npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add electron/mcp/server.js electron/preload.js src/components/HomePage.vue
git commit -m "feat: add MCP server status diagnostics"
```

### Task 11: 文档与接入说明

**Files:**
- Modify: `README.md`
- Create: `docs/plans/2026-04-29-opengit-embedded-mcp-usage.md`

**Step 1: README 增补功能说明**

补充：
- OpenGit 内置 MCP 服务
- 适用场景
- 提供的能力组

**Step 2: 写接入说明**

说明：
- 如何在 OpenGit 中开启
- localhost 地址和端口怎么配置
- 外部 AI / Codex 如何连接
- 第一版有哪些 tools

**Step 3: 验证**

确认文档与当前实际工具名一致。

**Step 4: Commit**

```bash
git add README.md docs/plans/2026-04-29-opengit-embedded-mcp-usage.md
git commit -m "docs: add embedded MCP usage guide"
```

### Task 12: 端到端联调与回归

**Files:**
- Verify only

**Step 1: 启动构建验证**

Run: `npm run build`
Expected: PASS

**Step 2: 本地联调检查**

验证：
- MCP server 可启动
- `projects.list` 能返回项目
- `terminals.list` 能返回终端
- `terminals.get_output` 能读到日志
- `remotes.list_pipelines` 能读到流水线

**Step 3: 回归检查**

确认不影响：
- 普通项目打开
- 终端使用
- GitLab/GitHub/Gitee 原有 UI 功能

**Step 4: 最终提交**

```bash
git add .
git commit -m "feat: add embedded MCP server for projects terminals and remotes"
```
