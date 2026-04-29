# OpenGit 内置 MCP 设计

日期：2026-04-29

## 背景

当前 OpenGit 已经具备三类核心能力，但它们主要面向 UI 和 Electron IPC：

- 项目与目录管理
- 终端会话与终端输出
- GitLab / GitHub / Gitee 的远端仓库与流水线能力

这导致外部 AI 或应用内运行的 Codex 无法稳定复用这些上下文：

- AI 找不到真实项目路径，不知道当前有哪些仓库
- AI 无法读取 OpenGit 当前终端里的历史输出，难以基于日志做分析
- AI 无法直接使用 OpenGit 已配置好的远端仓库平台能力

目标是把这些能力整理成一个“应用内 MCP Server”，让外部 AI 和内部 Codex 都通过统一 MCP 访问。

## 目标

第一版目标：

1. 让 AI 能发现 OpenGit 里的所有项目、目录、当前活动项目和打开标签页
2. 让 AI 能读取项目相关终端输出，并据此分析错误日志
3. 让 AI 能读取对应远端平台信息，包括仓库、MR/PR、流水线
4. 内部 Codex 和外部 AI 都走同一个 MCP 接口

第一版明确不做：

- 本地 Git 写操作工具
- 终端写入 / 执行命令
- 通用 HTTP 代理
- 远端平台的任意 API 透传
- 公网暴露或 token 鉴权

## 总体方案

采用：

- OpenGit 主进程内置一个本地 MCP Server
- 默认只监听 `127.0.0.1`
- 内外部 AI 都通过该 MCP Server 调用

推荐第一版传输方式：

- `localhost` 端口

不采用 `stdio` 的原因：

- OpenGit 的核心价值在于“常驻状态”
- 项目列表、当前打开标签、终端日志、缓存上下文都更适合常驻服务

不采用 Unix socket 的原因：

- 第一版兼容性不如 `localhost`
- 对当前需求收益不高

## 本地访问模型

第一版不使用 token。

约束方式改为：

- 只监听 `127.0.0.1`
- 设置页可开关 MCP Server
- 设置页可开关不同能力组

建议能力开关：

- 项目能力
- 终端能力
- 远端平台只读能力
- 远端平台写能力（第二阶段）

## 架构分层

建议新增：

- `electron/mcp/server.js`
- `electron/mcp/tools/projects.js`
- `electron/mcp/tools/terminals.js`
- `electron/mcp/tools/remotes.js`
- `electron/mcp/services/projects.js`
- `electron/mcp/services/terminals.js`
- `electron/mcp/services/remotes.js`
- `electron/mcp/schema.js`

职责划分：

### 1. server 层

负责：

- 启动与关闭 MCP Server
- 注册 tools / resources
- 本地端口监听
- 错误与调用日志

### 2. tools 层

负责：

- 定义 MCP tool 的名称、输入、输出
- 参数校验
- 组装用户可理解的结果结构

### 3. services 层

负责：

- 复用 OpenGit 现有项目、终端、远端平台能力
- 屏蔽 UI 导向的 IPC 细节
- 形成稳定领域接口

## 能力分组

### 一、项目能力 `projects.*`

目标是解决“AI 找不到项目”和“无法解析当前上下文项目”的问题。

第一版提供：

#### `projects.list`

返回 OpenGit 当前已知的全部项目与目录：

- 已添加目录
- 扫描得到的 Git 仓库
- 收藏项目
- 当前打开的项目标签

每项建议字段：

- `id`
- `name`
- `path`
- `type`: `git-repo | directory`
- `scanRoot`
- `isFavorite`
- `isOpen`
- `isActive`
- `currentBranch`
- `remoteProvider`
- `originUrl`

#### `projects.find`

按以下条件搜索项目：

- 名称
- 路径片段
- 分支名
- 远端 host

#### `projects.get`

获取单个项目/目录的详情：

- 基础路径信息
- Git / 目录模式
- 当前分支
- 远端 provider
- 最近打开时间
- 相关打开标签

#### `projects.get_active`

返回当前前台激活项目。

如果当前不是项目标签，则返回：

- 最近活动项目
- 或空结果

#### `projects.get_open_tabs`

返回当前打开的项目相关标签：

- 标签 id
- route type
- path
- 是否激活

### 二、终端能力 `terminals.*`

目标是让 AI 能拿到 OpenGit 中项目相关终端输出，并分析问题。

第一版只读。

#### `terminals.list`

返回当前所有终端会话：

- `terminalId`
- `projectPath`
- `cwd`
- `mode`: `split | liquid | standalone`
- `isActive`
- `isFocused`
- `createdAt`
- `lastOutputAt`

#### `terminals.get_output`

读取指定终端最近输出。

建议支持参数：

- `terminalId`
- `lines`
- `maxBytes`
- `includeAnsi`

#### `terminals.get_project_outputs`

聚合读取某个项目下所有终端输出。

建议支持：

- `projectPath`
- `linesPerTerminal`
- `includeInactive`

#### `terminals.get_recent_errors`

基于简单规则从终端日志里提取可疑片段：

- `error`
- `warn`
- `exception`
- `failed`
- `traceback`
- `panic`
- `vite error`
- `npm ERR!`

返回：

- 匹配行
- 上下文片段
- 来源 terminalId

### 三、远端平台能力 `remotes.*`

目标是让 AI 能使用 OpenGit 已保存的 GitLab / GitHub / Gitee 配置读取远端信息。

第一版只做高层只读工具，不提供任意 HTTP 能力。

#### `remotes.detect_provider`

基于本地仓库 `origin` 检测 provider：

- `gitlab`
- `github`
- `gitee`
- `unknown`

#### `remotes.get_repo`

获取远端仓库基础信息：

- provider
- owner/group
- repo/project
- default branch
- web url

#### `remotes.list_branches`

读取远端分支列表。

#### `remotes.list_merge_requests`

GitLab / Gitee 的 MR 列表。

#### `remotes.list_pull_requests`

GitHub 的 PR 列表。

#### `remotes.list_pipelines`

统一返回远端流水线 / Actions runs 列表。

#### `remotes.get_pipeline`

统一返回单条流水线详情与 jobs。

## 数据来源设计

### 项目数据来源

优先复用：

- 侧栏 scan roots
- 侧栏项目树
- `projectStore`
- 当前 `Browser` 打开的 tabs

项目服务层需要把这些状态整合成统一结构，而不是直接暴露单个 store 的原始格式。

### 终端数据来源

现有 `terminal.js` 更偏事件推送到前端，需要补一层“可查询缓冲”。

建议：

- 在主进程维护 `terminalOutputBuffers`
- key 使用 `terminalId`
- 同时索引 `projectPath`

每个终端保留：

- 最近 `2000` 行
- 或最近若干 KB 原始输出

实现方式建议用 ring buffer，避免无限增长。

缓冲应覆盖：

- 经典终端
- 灵动终端
- 分屏终端
- 独立终端

### 远端平台数据来源

复用现有：

- `electron/ipc/scm.js`

但不建议直接把现有 IPC handler 暴露给 MCP。

原因：

- 当前 IPC 更偏 UI 使用场景
- 返回结构不完全 MCP 友好
- 有些逻辑与组件状态耦合

因此建议抽 service 层：

- GitLab service
- GitHub service
- Gitee service
- unified pipeline service

## 权限与安全边界

虽然第一版不做 token，但仍然要限制风险。

### 本地访问边界

- 只绑定 `127.0.0.1`
- 默认关闭，需要在设置中开启
- 可显示当前监听端口

### 能力边界

第一版默认只开放只读能力：

- 项目读取
- 终端读取
- 远端读取

第二阶段若要开放写能力，再单独加开关：

- 创建 MR/PR
- 评论
- 触发流水线

### 凭据边界

远端平台凭据：

- 保持只在 OpenGit 内部使用
- MCP 调用方永远拿不到 token 明文
- tool 只返回业务结果，不返回凭据

## UI 与用户体验

建议在设置中新增“MCP 服务”区域，提供：

- 开启/关闭 MCP Server
- 当前状态
- 监听地址与端口
- 能力开关
- 最近调用日志

调用日志建议至少记录：

- 时间
- client 标识
- 工具名
- 参数摘要
- 是否成功
- 耗时

## 第一版建议范围

### 第一版实现

- MCP Server 常驻启动/关闭
- `projects.list`
- `projects.find`
- `projects.get`
- `projects.get_active`
- `projects.get_open_tabs`
- `terminals.list`
- `terminals.get_output`
- `terminals.get_project_outputs`
- `terminals.get_recent_errors`
- `remotes.detect_provider`
- `remotes.get_repo`
- `remotes.list_merge_requests`
- `remotes.list_pull_requests`
- `remotes.list_pipelines`
- `remotes.get_pipeline`

### 第一版不实现

- 终端写入
- 本地 Git 写操作
- 通用 HTTP 代理
- 远端写操作
- 流式日志订阅

## 后续扩展方向

第二阶段可以考虑：

- `projects.resolve_context`
- `terminals.tail`
- `remotes.create_merge_request`
- `remotes.create_pull_request`
- `remotes.comment`
- `remotes.rerun_pipeline`
- 只读资源化输出（如当前项目清单资源、终端摘要资源）

第三阶段再考虑：

- 本地 Git 写操作工具
- 终端写入能力
- 更细粒度的权限控制

## 推荐结论

推荐第一版采用：

- OpenGit 主进程内置 MCP Server
- `localhost` 监听
- 无 token
- 能力开关控制
- 只读优先
- 高层领域工具而非通用 API 代理

这样能最快满足三类核心诉求：

1. AI 能稳定找到项目
2. AI 能读取并分析终端输出
3. AI 能直接读取远端平台对象与流水线信息

同时又不会在第一版把权限面做得过大。*** End Patch
天天中彩票 to=functions.apply_patch code արզել to=functions.apply_patch code```diff
