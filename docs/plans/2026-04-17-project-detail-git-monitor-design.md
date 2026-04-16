# ProjectDetail Git 轻量监控设计（OpenGit）

## 背景
当前 `ProjectDetail` 的分支状态、ahead/behind、文件状态和提交历史刷新，主要依赖：
- 手动刷新
- 应用获得焦点时刷新
- 页面内 Git 操作完成后的显式刷新

这套机制对页面内操作足够，但对“在终端里提交、切换分支、拉取代码、修改文件”这类外部 Git 变更不够及时。项目列表已经能更快感知变化，而 `ProjectDetail` 仍需要切换页面或再次手动触发，体验不一致。

## 目标
为当前打开的 `ProjectDetail` 增加一个轻量 Git 监控链路，在不引入高频重刷新和额外全局后台负载的前提下，更及时地感知以下变化：
- 当前分支变化
- ahead/behind 变化
- 文件状态摘要变化
- merge/rebase 状态变化

## 非目标
- 不为所有项目全局后台监控
- 不直接监听所有 `.git` 文件并建立复杂 watch 规则
- 不把现有 `ProjectDetail` 刷新链路重写成第二套状态系统
- 第一版不覆盖 tag 列表、远程分支列表的自动监控刷新

## 方案对比

### 方案 1：前端直接定时调用现有重接口
- 做法：在 `ProjectDetail` 中定时调用 `getBranchStatus` / `loadProjectInfo`
- 优点：改动最少
- 缺点：接口本身较重，会触发 fetch、整份分支状态解析和多处状态更新，轮询代价偏高

### 方案 2：直接 watch `.git` 文件
- 做法：监听 `HEAD`、`index`、`FETCH_HEAD`、`packed-refs`、rebase/merge 临时目录等
- 优点：理论上更实时
- 缺点：Git 状态分散且不同操作路径差异大，容易漏监听或抖动，维护成本高

### 方案 3：轻量快照轮询，变化后再走现有局部刷新
- 做法：主进程提供一个轻量 Git 快照 IPC，前端只在 `ProjectDetail` 激活且可见时轮询；快照签名变化时，再触发现有局部刷新
- 优点：开销可控，语义清晰，能复用当前刷新链路
- 缺点：不是毫秒级实时，仍是轮询

## 选型
采用 **方案 3**。

原因：
- 比直接轮询重接口更轻，适合 2 秒级轮询
- 比直接 watch `.git` 更稳，不会把 Git 内部文件结构耦合到前端体验里
- 和现有 `ProjectDetail` 刷新机制兼容，只新增“变化发现”这一层

## 设计

### 1. 主进程轻量快照 IPC
新增一个仅供 `ProjectDetail` 使用的 Git 监控快照接口，例如：
- `get-project-git-monitor-snapshot`

该接口只返回轻量聚合结果，不触发现有的缓存刷新和远端 fetch。快照包含：
- `currentBranch`
- `localAhead`
- `remoteAhead`
- `changedCount`
- `stagedCount`
- `untrackedCount`
- `conflictedCount`
- `isMerging`
- `isRebasing`
- `signature`

其中 `signature` 由上述字段拼接生成，用于前端快速判断是否发生变化。

### 2. 快照来源
快照优先基于：
- `git status --porcelain=v2 --branch`

它可以一次性提供：
- 当前分支
- upstream
- ahead/behind
- 文件状态行

再补充读取 Git 目录中的操作状态：
- `MERGE_HEAD`
- `rebase-merge`
- `rebase-apply`

用来判断是否正在 merge / rebase。

### 3. 前端轮询时机
只在以下条件同时满足时轮询：
- `ProjectDetail` 标签处于激活状态
- 浏览器窗口可见
- 当前页面未卸载

停止条件：
- 标签失活
- 页面不可见
- 组件卸载

轮询间隔第一版定为 `2000ms`。

### 4. 刷新策略
前端保存上一份快照和签名。每次轮询：
- 如果 `signature` 没变化，不触发刷新
- 如果变化，按变化类型决定刷新范围

推荐映射：
- 当前分支变化：
  - `reloadBranches`
  - `reloadBranchStatus`
  - `reloadFileStatus`
  - `reloadCommitHistory`
- ahead/behind 变化：
  - `reloadBranchStatus`
  - `reloadCommitHistory`
- 文件状态摘要变化：
  - `reloadFileStatus`
- merge/rebase 状态变化：
  - `reloadBranchStatus`
  - `reloadFileStatus`

这样不会因为一个文件改动就重拉整份分支列表，也不会因为分支切换漏掉提交历史刷新。

### 5. 与现有刷新链路的关系
不新增第二套 UI 更新逻辑。监控只负责：
- 发现变化
- 决定刷新范围
- 调用现有 `queueProjectRefresh(...)`

现有的：
- `loadBranchStatus`
- `loadBranches`
- `fileStatusRef.loadFileStatus`
- `commitHistoryRefreshToken`

全部保留，监控只是更及时地触发它们。

## 错误处理
- 快照接口失败时，前端记录警告，不清空当前 UI
- 单次轮询失败不终止监控
- 连续失败时维持当前轮询节奏，不做指数退避，避免实现过重

## 测试策略
- 为快照解析和签名生成增加纯函数测试
- 为前端刷新判定增加纯函数测试
- 构建验证：`npm run build`

## 验收标准
- 在 `ProjectDetail` 激活时，终端中执行 `git checkout` 后，当前分支可在轮询周期内自动更新
- 在终端中执行 `git commit` / `git push` / `git pull` 后，ahead/behind 和提交历史可在轮询周期内自动更新
- 修改、暂存、删除文件后，文件状态可在轮询周期内自动更新
- 切到别的标签页或窗口不可见时，不继续轮询
