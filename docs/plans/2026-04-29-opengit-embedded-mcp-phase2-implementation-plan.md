# OpenGit Embedded MCP Phase 2 Implementation Plan

**Goal:** 在第一阶段只读 MCP 的基础上，补齐终端流式读取/受控写入，以及远端平台高层写操作与受控 API 请求能力，同时保持 token 不出主进程。

**Architecture:** 继续沿用 `electron/mcp` 的 server / tools / services 分层。第二阶段通过扩展 `mcpConfig` 能力开关，新增 `terminals.tail`、`terminals.write`、`remotes.create_*`、`remotes.comment_*`、`remotes.rerun_pipeline` 和 `remotes.request`。所有远端写操作和代理请求都由主进程内部附加 provider token 后发出，外部 MCP client 不直接拿到 token。

**Tech Stack:** Electron main process, Node.js, existing terminal IPC/runtime, existing GitLab/GitHub/Gitee service logic, local MCP HTTP server, Vue settings UI

---

### Task 1: 扩展 MCP 配置与设置页能力开关

**Files:**
- Modify: `electron/mcp/config.js`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/components/HomePage.vue`

**Step 1: 增加第二阶段能力开关**

在 `mcpConfig.capabilities` 中新增：
- `terminalsWrite`
- `remotesWrite`
- `remotesRequest`

默认都为 `false`。

**Step 2: 设置页展示高风险开关**

在 `HomePage.vue` 的 `MCP 服务` 分组中增加三个开关，并明确标记为高风险能力。

**Step 3: 保持主进程 server 热重载**

保存配置后，已有 MCP server 继续通过 `restart(config)` 更新能力集合。

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/mcp/config.js electron/main.js electron/preload.js src/components/HomePage.vue
git commit -m "feat: add MCP phase 2 capability toggles"
```

### Task 2: 为终端输出增加增量 tail 能力

**Files:**
- Modify: `electron/mcp/services/terminalBuffers.js`
- Modify: `electron/mcp/services/terminals.js`
- Modify: `electron/mcp/tools/terminals.js`

**Step 1: 为 terminal buffer 增加 cursor 概念**

基于已有 `seq` 字段，为每个终端实现：
- 按 `cursor` 取增量输出
- 返回 `nextCursor`
- 返回 `hasMore`

**Step 2: 在 terminals service 新增 tail 方法**

实现：
- `tailTerminalOutput({ terminalId, cursor, maxLines, includeAnsi })`

**Step 3: 注册 MCP 工具**

新增：
- `terminals.tail`

**Step 4: 验证**

验证点：
- 能拿到从指定 cursor 之后的新输出
- 不传 cursor 时默认拿最近一批

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/mcp/services/terminalBuffers.js electron/mcp/services/terminals.js electron/mcp/tools/terminals.js
git commit -m "feat: add MCP terminal tail support"
```

### Task 3: 为现有终端增加受控写入能力

**Files:**
- Modify: `electron/ipc/terminal.js`
- Modify: `electron/mcp/services/terminals.js`
- Modify: `electron/mcp/tools/terminals.js`

**Step 1: 暴露 terminalId 到真实 write 通道的映射**

梳理当前终端 runtime，确认如何通过 `terminalId` 找到：
- 对应 pty
- 对应写入入口

必要时在 `terminal.js` 中补一个轻量 helper，而不是新增一套执行器。

**Step 2: 在 terminals service 中实现写入**

实现：
- `writeTerminal({ terminalId, text, appendNewline })`

返回：
- terminalId
- accepted
- bytesWritten（可选）

**Step 3: MCP 工具注册**

新增：
- `terminals.write`

只在 `capabilities.terminalsWrite === true` 时注册。

**Step 4: 验证**

验证点：
- 可以向现有终端写入命令
- 不会自动新建终端
- terminal 不存在时返回明确错误

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/ipc/terminal.js electron/mcp/services/terminals.js electron/mcp/tools/terminals.js
git commit -m "feat: add MCP terminal write support"
```

### Task 4: 远端高层写操作服务实现

**Files:**
- Modify: `electron/mcp/services/remotes.js`

**Step 1: GitLab 写操作**

实现：
- `createMergeRequest()`
- `commentMergeRequest()`
- `rerunPipeline()`（GitLab retry / rerun 语义）

**Step 2: GitHub 写操作**

实现：
- `createPullRequest()`
- `commentPullRequest()`
- `rerunPipeline()`（GitHub Actions rerun）

**Step 3: Gitee 写操作**

实现：
- `createPullRequest()`
- `commentPullRequest()`

如果 Gitee 对“重跑流水线”没有稳定统一接口，先明确返回 unsupported。

**Step 4: 统一 provider 层返回结构**

每个写操作统一返回：
- `provider`
- `id / iid / number`
- `webUrl`
- `state`
- `rawStatus`

**Step 5: 验证**

Run: `npm run build`
Expected: PASS

**Step 6: Commit**

```bash
git add electron/mcp/services/remotes.js
git commit -m "feat: add MCP remote write services"
```

### Task 5: 暴露远端高层写工具

**Files:**
- Modify: `electron/mcp/tools/remotes.js`
- Modify: `electron/main.js`

**Step 1: 新增高层工具**

新增：
- `remotes.create_merge_request`
- `remotes.create_pull_request`
- `remotes.comment_merge_request`
- `remotes.comment_pull_request`
- `remotes.rerun_pipeline`

**Step 2: 做 provider 级别约束**

例如：
- GitHub 上不暴露 `create_merge_request`
- GitLab 上不暴露 `create_pull_request`

也可以工具保持可见，但调用时返回明确 unsupported；二选一即可，推荐后者，工具名更稳定。

**Step 3: 通过配置开关控制注册**

仅当 `capabilities.remotesWrite === true` 时注册这些工具。

**Step 4: 验证**

Run: `npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add electron/mcp/tools/remotes.js electron/main.js
git commit -m "feat: expose MCP remote write tools"
```

### Task 6: 实现受控远端代理请求 `remotes.request`

**Files:**
- Modify: `electron/mcp/services/remotes.js`
- Modify: `electron/mcp/tools/remotes.js`
- Modify: `electron/main.js`

**Step 1: 在 remotes service 中新增 requestRemoteApi**

输入：
- `projectPath`
- `provider`
- `method`
- `path`
- `query`
- `body`
- `headers`

内部逻辑：
- 基于项目解析 provider
- 选择 provider API base URL
- 内部附加 token
- 过滤非法头
- 发出请求

**Step 2: 增加边界校验**

强约束：
- 仅允许 `GET/POST/PUT/PATCH/DELETE`
- path 必须为相对 provider API 的相对路径
- 禁止 AI 自己指定 host
- 禁止覆盖 `Authorization`
- 禁止 Cookie 透传

**Step 3: MCP 工具注册**

新增：
- `remotes.request`

仅当 `capabilities.remotesRequest === true` 时注册。

**Step 4: 统一返回**

返回：
- `provider`
- `status`
- `headers`
- `data`

**Step 5: 验证**

Run: `npm run build`
Expected: PASS

**Step 6: Commit**

```bash
git add electron/mcp/services/remotes.js electron/mcp/tools/remotes.js electron/main.js
git commit -m "feat: add MCP controlled remote request tool"
```

### Task 7: 文档与对外说明更新

**Files:**
- Modify: `README.md`
- Modify: `docs/mcp/opengit-embedded-mcp.md`

**Step 1: 更新 MCP 能力列表**

增加第二阶段工具：
- `terminals.tail`
- `terminals.write`
- `remotes.create_*`
- `remotes.comment_*`
- `remotes.rerun_pipeline`
- `remotes.request`

**Step 2: 明确安全边界**

写清楚：
- token 仍不返回给 AI
- 远端请求是受控代理
- 高风险能力默认关闭

**Step 3: 验证**

Run: `npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add README.md docs/mcp/opengit-embedded-mcp.md
git commit -m "docs: document MCP phase 2 capabilities"
```

### Task 8: 联调与回归

**Files:**
- No code changes expected

**Step 1: 本地 JSON-RPC 自测**

验证：
- `initialize`
- `tools/list`
- `tools/call`

**Step 2: 第二阶段能力逐项自测**

重点验证：
- `terminals.tail`
- `terminals.write`
- `remotes.create_*`
- `remotes.rerun_pipeline`
- `remotes.request`

**Step 3: 回归第一阶段**

确认第一阶段只读工具没有被第二阶段破坏：
- `projects.list`
- `terminals.get_output`
- `remotes.list_pipelines`

**Step 4: Final Verification**

Run:

```bash
npm run build
git diff --check
```

Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: implement MCP phase 2 interactive capabilities"
```

## Notes

- `terminals.write` 必须只写入已有终端，不要额外发散成“任意本地命令执行”
- `remotes.request` 是第二阶段最灵活也最危险的能力，必须把 host 和 auth 锁死在 provider 内部
- 若某个 provider 的写接口行为不统一，优先返回 unsupported，不要为了对齐而做模糊兼容
