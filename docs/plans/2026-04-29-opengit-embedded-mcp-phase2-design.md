# OpenGit 内置 MCP 第二阶段设计

日期：2026-04-29

## 背景

第一阶段已经提供了只读 MCP 能力：

- `projects.*` 项目发现
- `terminals.*` 终端输出读取
- `remotes.*` 远端平台只读查询

但这还不足以支撑更强的 AI 协作场景：

- AI 只能看终端输出，不能持续跟踪或向当前终端写入命令
- AI 只能读取 GitLab / GitHub / Gitee 信息，不能直接完成 MR/PR、评论、重跑流水线等协作动作
- AI 对远端平台 API 的灵活性仍然不够，遇到第一阶段未封装的接口时会被能力边界卡住

第二阶段目标是在不暴露明文 token 的前提下，补齐“受控写能力”。

## 第二阶段目标

第二阶段目标：

1. 为终端能力补齐流式跟踪与受控写入
2. 为远端平台补齐高层写操作
3. 提供一个受控的远端 API 请求能力 `remotes.request`
4. 保持 OpenGit 主进程代持凭据，外部 AI 拿不到 token 明文
5. 在设置页为这些高风险能力增加单独能力开关

第二阶段仍然不做：

- 任意本地 git 命令执行
- 任意系统命令执行
- 任意域名代理访问
- 把已保存 token 明文直接返回给 AI
- 默认自动开启高风险能力

## 设计原则

### 1. 凭据不下发

外部 AI 不直接拿到：

- GitLab token
- GitHub token
- Gitee token

所有远端调用都由 OpenGit 主进程在内部附加凭据并发起。

### 2. 高层工具优先

常见高频动作优先做成高层工具：

- 创建 MR/PR
- 评论
- 重跑流水线

这样对 AI 更稳定，也更容易做参数校验和错误提示。

### 3. 受控代理作为补充

当高层工具尚未覆盖具体接口时，允许 AI 通过受控代理发请求，但边界必须清晰：

- 仅限已识别 provider
- 仅限对应官方 API 根路径
- 仅限 `https`
- 不允许任意 host
- 仍然不返回 token

### 4. 高风险能力默认关闭

第二阶段新增能力默认关闭，通过设置页显式开启：

- `terminalsWrite`
- `remotesWrite`
- `remotesRequest`

## 终端能力设计

### 一、`terminals.tail`

目标：

- 让 AI 持续读取某个终端或某个项目下终端的最新输出

第一版建议用“增量轮询”而不是长连接流式订阅。

输入建议：

- `terminalId`
- `cursor`
- `maxLines`
- `includeAnsi`

返回：

- `terminalId`
- `nextCursor`
- `hasMore`
- `lines`

设计原因：

- 更容易与当前 ring buffer 对齐
- 不需要额外引入 SSE / websocket
- 对外部 MCP client 兼容性更稳

### 二、`terminals.write`

目标：

- 让 AI 可以往当前 OpenGit 终端会话写入命令或文本

输入建议：

- `terminalId`
- `text`
- `appendNewline`

边界：

- 仅写入已存在终端
- 不负责新建终端
- 不负责切换项目
- 不自动执行危险确认逻辑

为什么先做写入而不是“直接执行新命令”：

- 现有终端已经有 `cwd`
- 现有终端已经绑定项目语境
- 现有终端里可能已有任务和上下文
- 风险比“主进程直接新开 shell 命令”更低

### 三、`terminals.write_project`

可选高层工具。

目标：

- 给 AI 一个“按项目写当前活动终端”的简化入口

输入：

- `projectPath`
- `text`
- `appendNewline`

行为：

- 找到该项目当前最合适的终端会话
- 内部转发到 `terminals.write`

如果第二阶段范围需要收紧，可以先不做这一层。

## 远端能力设计

### 一、高层写工具

建议优先新增：

#### `remotes.create_merge_request`

适用：

- GitLab

输入建议：

- `projectPath`
- `sourceBranch`
- `targetBranch`
- `title`
- `description`
- `removeSourceBranch`
- `draft`

#### `remotes.create_pull_request`

适用：

- GitHub
- Gitee

输入建议：

- `projectPath`
- `sourceBranch`
- `targetBranch`
- `title`
- `description`
- `draft`

#### `remotes.comment_merge_request`

适用：

- GitLab

输入建议：

- `projectPath`
- `mergeRequestIid`
- `body`

#### `remotes.comment_pull_request`

适用：

- GitHub
- Gitee

输入建议：

- `projectPath`
- `pullRequestNumber`
- `body`

#### `remotes.rerun_pipeline`

适用：

- GitLab pipeline retry
- GitHub Actions rerun

输入建议：

- `projectPath`
- `pipelineId`
- `failedJobsOnly`

### 二、受控代理 `remotes.request`

目标：

- 在不暴露 token 的前提下，允许 AI 调未封装的 provider API

输入建议：

- `projectPath`
- `provider`
- `method`
- `path`
- `query`
- `body`
- `headers`（可选，仅允许白名单头）

边界：

- provider 必须与本地项目 `origin` 解析结果一致，或为空时由 OpenGit 自动解析
- host 不由 AI 指定
- path 必须以 provider API 根路径下的相对路径形式给出
- 只允许 `GET / POST / PUT / PATCH / DELETE`
- 不允许覆盖 `Authorization`
- 不允许任意透传 Cookie
- 返回标准化结果：
  - `status`
  - `headers`（过滤后）
  - `data`

#### provider API 根路径

- GitLab：`<gitlabBaseUrl>/api/v4/...`
- GitHub：`https://api.github.com/...`
- Gitee：`https://gitee.com/api/v5/...`

### 三、为什么不直接返回 token

不直接给 AI token，原因：

- 权限面过大
- 难以审计
- 外部 client 一旦缓存或透传，凭据泄漏风险高
- 和“本地 MCP 仅提供能力，不直接暴露密钥”的原则冲突

## 设置页扩展

建议在现有 MCP 设置基础上增加三个开关：

- `远端写能力`
- `远端受控请求`
- `终端写入能力`

默认值：

- `false`
- `false`
- `false`

并在 UI 上明确标注为高风险能力。

## 服务层拆分建议

### `electron/mcp/services/terminals.js`

第二阶段扩展：

- `tailTerminalOutput()`
- `writeTerminal()`
- 可选 `writeProjectTerminal()`

同时需要补：

- 从 `terminalId` 找到真实 pty / write 通道
- 和现有 terminal runtime / store 做映射

### `electron/mcp/services/remotes.js`

第二阶段扩展：

- `createMergeRequest()`
- `createPullRequest()`
- `commentMergeRequest()`
- `commentPullRequest()`
- `rerunPipeline()`
- `requestRemoteApi()`

这里建议把 provider 相关的 URL 拼装、header 拼装、body 序列化进一步抽成内部 helper，避免高层工具和 `remotes.request` 各写一套。

## 错误处理

### 终端

- terminal 不存在：返回明确错误
- terminal 已退出：返回明确错误
- 写入失败：返回底层原因

### 远端

- provider 不支持该动作：返回明确错误
- token 缺失：返回需要配置平台凭据
- API 403/404/422：保留 provider 返回信息
- path 非法：拒绝请求

## 审计建议

第二阶段建议至少在主进程日志中记录：

- 工具名
- 项目路径
- provider
- 方法和路径摘要
- 是否成功

先做简单日志即可，不要求完整 UI 审计面板。

## 推荐实现顺序

1. 扩展 MCP 配置，增加高风险能力开关
2. 先实现 `terminals.tail`
3. 再实现 `terminals.write`
4. 先做高层远端写工具
5. 最后做 `remotes.request`

原因：

- 终端能力对本地调试收益最快
- 高层写工具更稳定
- 受控代理最灵活，但边界最复杂，适合最后接

## 成功标准

第二阶段完成后，AI 应该能做到：

1. 找到当前项目
2. 读取并持续跟踪终端输出
3. 向当前终端写入命令
4. 基于 OpenGit 已配置的远端凭据：
   - 创建 MR/PR
   - 评论
   - 重跑流水线
   - 调用未封装但受控的 provider API

并且：

- AI 仍拿不到 token 明文
- 所有高风险能力都能在设置里关闭
