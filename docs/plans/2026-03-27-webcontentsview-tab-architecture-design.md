# WebContentsView 统一 Tab 架构设计（OpenGit）

## 背景

当前 OpenGit 的桌面壳层存在两套并行的页面管理模型：

1. 顶层 `TabManager` 管理应用级 tab
2. `Browser.vue` 内部再维护一套浏览器子 tab

同时，网页内容当前由 `<webview>` 承载，Git 页面、终端、收藏、历史等内置页面由 Vue 组件承载。这带来几个根问题：

- tab 管理是双层嵌套，状态同步复杂
- 浏览网页与内置功能页面没有统一身份模型
- `<webview>` 作为长期浏览器承载层不稳定，Passkey / 下载 / 权限 / 弹窗 / 新窗口行为都容易出现“像浏览器但不完整”的体验
- `Browser.vue` 与 `WebView.vue` 过重，后续演进成本高

目标不是继续修补 `<webview>`，而是把整体架构调整为“统一 tab 模型 + 分离内容承载”。

## 目标

构建一套统一的 `AppTab` 架构，用同一套 tab 管理模型承载两类内容：

- `web`：网页内容，由主进程 `WebContentsView` 承载
- `builtin`：内置功能页面，由渲染进程 Vue 组件承载并保活

## 非目标

这轮架构设计不追求一次性完成所有能力迁移，以下事项不在第一阶段范围内：

- 立即完整迁移收藏、历史、终端、Git 页面
- 一次性替换全部浏览器功能
- 立即解决所有 Passkey / 权限 / 下载问题
- 将所有内置页面迁移到主进程视图体系

## 核心判断

### 为什么不继续用 `<webview>`

- Electron 官方已不建议继续围绕 `<webview>` 构建复杂嵌入浏览体验
- `<webview>` 是嵌入式 guest 内容，不是浏览器壳的一等模型
- 对于 Passkey / WebAuthn、下载、权限、窗口管理这类浏览器底层能力，主进程直接管理 `webContents` 才是更稳定的路径

### 为什么选 `WebContentsView`

- `BrowserView` 已废弃，Electron 推荐使用 `WebContentsView`
- `WebContentsView` 更接近 Chromium 中 `tab -> WebContents` 的模型
- 主进程可以直接管理页面生命周期、权限、下载、session、弹窗和导航事件

## 总体架构

### 统一 tab 抽象

系统只有一套主 tab，不再保留“浏览器外层 tab + 浏览器内层 tab”的双层结构。

所有 tab 统一进入 `AppTab` 模型，按内容类型分两类：

- `web`
- `builtin`

### 内容承载分离

统一 tab，不等于统一承载。

- `web` tab：由主进程创建和管理 `WebContentsView`
- `builtin` tab：由渲染进程 Vue 页面承载，并通过 `KeepAlive` 或缓存策略保活

这样可以同时实现：

- 浏览器核心能力迁移到正确承载层
- 现有 Git / 终端 / 收藏 / 历史页面资产继续复用
- 避免一次性重写整个应用

## 数据模型

### AppTab

统一字段：

- `tabId`: 全局唯一 ID
- `kind`: `web | builtin`
- `key`: 业务唯一键
- `title`
- `icon`
- `closable`
- `pinned`
- `active`
- `lifecycle`: `active | warm | frozen | discarded`
- `persistPolicy`: `keep-alive | restorable | ephemeral`

### WebTab

扩展字段：

- `url`
- `displayUrl`
- `canGoBack`
- `canGoForward`
- `isLoading`
- `loadError`
- `sessionMode`: `default | private`
- `viewId`
- `lastNavigationId`

身份规则：

- 唯一性按 `tabId`
- 多个网页 tab 天然允许共存

### BuiltinTab

扩展字段：

- `routeKey`
- `entityKey`
- `props`
- `cacheKey`
- `singleton`
- `keepAlive`

身份规则：

- `key = routeKey + entityKey`
- 支持天然表达“单例页”和“多实例页”

示例：

- `git:remote`
- `git:project:/abs/path`
- `browser:history`
- `browser:favorites`
- `terminal:standalone:<id>`

## 运行时职责

### 渲染进程：TabRegistry

负责：

- 统一 tab 元数据管理
- tab 顺序、激活、关闭、恢复
- TabBar、地址栏、工具栏、状态条
- builtin 页面的渲染和保活
- 将可视区域 bounds 和激活状态同步到主进程

不负责：

- 直接控制网页内核实例
- 推测网页导航状态

### 主进程：WebTabManager

负责：

- 创建、销毁、挂载、隐藏 `WebContentsView`
- `tabId -> viewId -> webContents` 映射
- session、permission、download、popup、新窗口策略
- 页面导航事件、标题、favicon、错误、加载状态同步

不负责：

- Git 页面业务
- 内置 Vue 页面生命周期

## 内容区渲染规则

同一时刻只展示一个激活内容。

### 激活 `web` tab

- 主进程显示对应 `WebContentsView`
- 渲染进程 builtin 内容区隐藏
- 地址栏和导航状态由主进程回推

### 激活 `builtin` tab

- 主进程隐藏全部 `WebContentsView`
- 渲染进程显示对应 Vue 页面
- 页面保持保活状态

这点非常关键，因为 `WebContentsView` 不在 DOM 中，不能沿用 `<webview>` 的模板渲染心智。

## 保活策略

### Builtin tab

默认保活，尤其是以下页面：

- Git 仓库详情
- 远端仓库
- 终端
- 历史 / 收藏 / 密码管理

切换离开不销毁，只从可见区域切出。

### Web tab

第一阶段保留实例，后续扩展生命周期：

- `active`
- `warm`
- `frozen`
- `discarded`

## 现有模块的迁移方向

### TabManager.vue

从“应用级 tab 容器”演进为唯一顶层 tab 容器。

新职责：

- 管所有 `AppTab`
- 不再固定塞入一个 browser 容器 tab

### Browser.vue

从“浏览器子系统页面”拆成浏览器壳层能力。

可保留文件名，但职责需要收缩为：

- 地址栏
- 前进后退刷新
- 状态展示
- 当前激活内容壳层

### NewTabPage.vue

不再承担内容总分发器角色。

只作为一个普通 builtin 页面，比如：

- `browser:new-tab`

### WebView.vue

停止作为长期主路径承载层继续加功能。

在迁移期间仅做过渡对照，最终从主路径移除。

## 建议的新模块边界

### 渲染进程

建议新增：

- `src/stores/appTabs.js`
- `src/components/shell/AppTabBar.vue`
- `src/components/shell/BrowserToolbar.vue`
- `src/components/shell/BuiltinPageHost.vue`

### 主进程

建议新增：

- `electron/tab-manager/web-tab-manager.js`
- `electron/tab-manager/web-session-manager.js`
- `electron/tab-manager/web-download-manager.js`
- `electron/tab-manager/web-permission-manager.js`

## IPC 设计原则

引入显式、单职责的 web tab IPC：

- `web-tab:create`
- `web-tab:destroy`
- `web-tab:activate`
- `web-tab:navigate`
- `web-tab:reload`
- `web-tab:go-back`
- `web-tab:go-forward`
- `web-tab:set-bounds`
- `web-tab:event-state-changed`
- `web-tab:event-title-updated`
- `web-tab:event-favicon-updated`
- `web-tab:event-load-failed`

原则：

- 渲染进程发命令
- 主进程回状态
- 任何可见状态都必须有明确单一来源

## 第一阶段 Spike

### 范围

只验证新架构能否跑通。

支持：

- 顶层统一 tab 模型
- `web` tab
- `builtin:new-tab`
- `WebContentsView` 打开网页
- 地址栏输入 URL
- 新建网页 tab
- 切换 tab
- 关闭 tab
- 前进后退刷新
- 标题同步

### 刻意不做

- 下载管理
- Passkey 完整修复
- 权限面板
- 收藏 / 历史迁移
- Git 页面迁移
- 终端迁移
- 全量持久化恢复

原因：先证明架构成立，再往上补能力。

## 正式迁移顺序

### Phase A：架构立住

- 建立统一 `AppTab`
- 移除 browser 外层固定 tab 思路
- 跑通一个 `WebContentsView` web tab
- 跑通一个 builtin `new-tab`

### Phase B：浏览器基本能力回补

- 多 web tab
- 导航状态同步
- 标题 / favicon / loading / error
- 新窗口策略

### Phase C：内置页接回统一 tab

- `git:remote`
- `git:project:/abs/path`
- `browser:history`
- `browser:favorites`
- `terminal:*`

### Phase D：浏览器高级能力

- 下载
- 权限
- session mode
- Passkey / WebAuthn
- 崩溃恢复

### Phase E：清理旧系统

- 删除 browser 作为外层固定 tab 的旧逻辑
- 删除 `NewTabPage` 的旧内容分发职责
- 删除 `WebView.vue` 的主路径依赖

## 风险

- `WebContentsView` 不在 DOM 中，主进程与渲染进程边界会更明确，也更复杂
- 现有很多浏览器状态逻辑写死在 `Browser.vue` 中，需要谨慎抽离
- 统一 tab 模型改动面大，必须先做最小 Spike 验证，再扩展能力

## 决策结论

采用以下路线：

1. 统一主 tab 模型
2. 网页迁移到 `WebContentsView`
3. 内置页继续留在 Vue 中并保活
4. 先做最小 Spike，再逐步替换旧浏览器路径

这是在当前代码基础上，兼顾演进成本、功能连续性和长期可维护性的最合适方案。
