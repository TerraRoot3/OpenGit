# Codex 终端会话状态监控设计

日期：2026-05-16

## 背景

OpenGit 现在已经支持在内部终端里运行 Codex，会话也可以通过 AI 会话页恢复到终端里继续执行。但一旦用户切到别的项目页、别的子页面，或者应用退到后台，就很难知道当前 Codex 会话是否：

- 仍在运行
- 卡在等待用户确认
- 已经结束

现有 UI 也没有把这类状态同步到更外层的导航位和项目 tab。结果是用户即使离开当前终端页，也只能靠手动切回来看状态，错过确认或结束提示。

## 目标

第一版目标：

1. 只监控 OpenGit 内部终端里的 Codex 会话
2. 为 Codex 会话识别稳定的运行状态
3. 把状态同步到：
   - browser 顶部项目 tab
   - `ProjectDetail` 左侧导航里的 `终端` 入口
4. 在合适场景下发送系统通知
5. 不影响普通终端使用，不误报非 Codex 会话

第一版不做：

- 外部 Terminal / iTerm 里的 Codex 会话
- 终端内部 tab 状态展示
- 会话历史时间线
- 更细粒度的中间状态，例如静默中、网络中、推理中
- `未知` 状态的 UI 展示或系统通知

## 设计原则

### 1. 只监控内部终端

状态源只来自 OpenGit 自己管理的 terminal runtime、terminal output 和终端生命周期，不去读取系统范围的 shell 进程树。

### 2. 主进程统一判断

Codex 会话状态不在 Vue 组件里各自判断，而是在主进程统一维护状态机。渲染层只负责读取和展示。

### 3. 未知状态静默

只有能明确识别出的状态才展示。`未知` 仅作为内部兜底，不显示、不通知，避免 UI 噪声和误报。

### 4. 通知要少但准

系统通知只在真正有行动价值时触发：

- `等待确认`
- `已结束`

并且只有在应用退到后台，或者当前项目不在可见页时才弹。

## 状态模型

### 一、终端级状态

每个 terminal session 维护一份 Codex 状态：

- `running`
- `awaiting_confirmation`
- `ended`
- `unknown`

其中：

- `running`：当前 terminal 已识别为 Codex 会话，且本轮会话仍在进行
- `awaiting_confirmation`：运行中的前提下，最近输出命中确认/授权类提示
- `ended`：之前是 Codex 会话，本轮会话已经结束
- `unknown`：不是 Codex 会话，或无法稳定识别

### 二、项目级聚合状态

一个项目可能对应多个终端会话，因此需要从 terminal 级状态聚合为 project 级状态，用于 browser tab 和左侧导航展示。

聚合优先级：

1. `awaiting_confirmation`
2. `running`
3. `ended`
4. `unknown`

也就是说：

- 只要项目里有任一 Codex 终端在等待确认，项目级状态就是 `awaiting_confirmation`
- 否则只要有任一 Codex 终端在运行，项目级状态就是 `running`
- 否则如果项目里最近有结束的 Codex 会话，项目级状态是 `ended`
- 没有任何可识别 Codex 会话时，视为 `unknown`，不展示

## 状态识别方案

## 方案对比

### 方案 1：纯终端输出关键词识别

直接从 terminal output 里匹配 `confirm / allow / yes/no / done / finished` 等文案。

优点：

- 接入快

缺点：

- 很脆
- 只靠输出很难稳定区分 `运行中` 和 `已结束`
- Codex TUI 文案变化后容易误判

### 方案 2：推荐，子进程存在性 + 输出特征混合识别

主进程为每个终端建立一个 `codex monitor`：

- 通过内部终端写入命令、启动记录和 runtime 元信息判断该终端是不是 Codex 会话
- 用最近输出窗口识别“等待确认”
- 用会话退出或明确结束信号识别“已结束”

优点：

- `运行中 / 已结束` 识别更稳
- `等待确认` 仍然可以通过输出特征完成
- 状态源统一，便于同步到多个 UI 表面和通知系统

缺点：

- 比纯关键词方案多一层状态管理

### 方案 3：读取 `~/.codex` 会话文件或索引

用 Codex 自己的本地 session / transcript 文件反推实时状态。

优点：

- 理论上信息多

缺点：

- 更适合历史会话，不适合实时状态
- 与 Codex 本地存储结构耦合过深
- 不如 terminal runtime 直观

### 方案结论

第一版采用方案 2。

## 识别流程

### 一、识别 Codex 会话

第一版只识别 OpenGit 内部 terminal 中显式启动的 Codex 会话。

候选信号：

1. 终端写入文本或启动命令命中 `codex`
2. 会话启动后的一小段输出命中 Codex 特征
3. 终端标题、cwd、runtime 元信息作为辅助，不单独作为判定依据

只要不能稳定识别为 Codex，会话就保持 `unknown`。

### 二、识别 `running`

一旦会话被认定为 Codex 会话，并且本轮会话尚未结束，就进入 `running`。

短时间静默不改变状态。也就是说，第一版不把“暂时没有输出”解释成非运行态。

### 三、识别 `awaiting_confirmation`

在 `running` 的前提下，最近输出命中确认类模式时切到 `awaiting_confirmation`。

模式来源：

- 审批/授权文案
- yes/no、allow/deny、confirm/cancel 等提示
- Codex 终端内典型确认片段

这部分需要做成集中维护的 pattern 列表，避免散在组件里。

### 四、识别 `ended`

满足任一条件时切到 `ended`：

- Codex 相关终端会话退出
- 已识别为 Codex 的会话明确完成本轮任务并结束

`ended` 不是永久态。它是“最近一次会话已结束”的一个短期可见状态，用来支持浏览器 tab、导航和通知。

## UI 展示设计

第一版只同步两处。

### 一、browser 顶部项目 tab

只对项目类型 tab 显示 Codex 状态，不影响普通网页 tab。

表现建议：

- `running`：小蓝点或轻强调色指示
- `awaiting_confirmation`：橙红或高警示色点
- `ended`：绿色或完成态点

第一版不加文字，只加小点或小图标，避免 tab 太挤。

### 二、`ProjectDetail` 左侧导航里的 `终端` 入口

在 `终端` 这一行右侧显示更明显一点的状态点或 badge：

- `running`：主色或蓝色
- `awaiting_confirmation`：高警示色
- `ended`：完成态

这里比 browser tab 可以稍强一点，因为这是项目内导航位，空间更大。

### 三、`unknown` 不展示

如果当前项目没有可识别的 Codex 会话：

- browser tab 不显示状态
- 左侧 `终端` 入口不显示状态

## 通知设计

系统通知只针对：

- `awaiting_confirmation`
- `ended`

满足以下任一条件才发送：

1. 应用在后台
2. 应用在前台，但当前项目不在可见页

这些情况不通知：

- `running`
- `unknown`
- 当前项目就在前台可见页

这样用户切走之后能收到关键提醒，但不会在当前正在看的页面上再被额外打扰。

## 架构落点

### 一、主进程

新增一层 `codex session monitor`，负责：

- 订阅 terminal runtime 生命周期
- 订阅 terminal output buffer
- 维护 `terminalId -> codexState`
- 聚合 `projectPath -> projectCodexState`
- 控制系统通知发送

建议位置：

- `electron/ipc/terminal-runtime.js` 继续做 runtime 注册，不直接承担状态判断
- 新增例如：
  - `electron/ipc/codex-session-monitor.js`
  - 或 `electron/services/codexSessionMonitor.js`

### 二、预加载与渲染层桥接

通过 preload 暴露：

- 获取当前 Codex 状态快照
- 订阅状态变化事件

渲染层只消费这些数据，不自己判断。

### 三、渲染层展示

建议修改：

- `src/components/browser/Browser.vue`
  - 给项目 tab 增加 Codex 状态点
- `src/components/git/ProjectDetail.vue`
  - 给左侧 `终端` 导航项增加状态点

### 四、通知来源

通知从主进程发出，原因：

- 前后台判断更容易统一
- 不依赖某个 Vue 页面当前是否还挂着
- 后续若要接系统层能力，更适合继续放主进程

## 边界与异常处理

### 1. 非 Codex 终端

保持 `unknown`，完全静默。

### 2. 输出模式误判

第一版通过有限 pattern 支持 `awaiting_confirmation`。若命中不稳定，宁可少报，也不要把普通输出误报成确认态。

### 3. 会话快速结束

如果 Codex 会话很快结束，允许直接进入 `ended`。项目级聚合状态也可短暂停留在 `ended`，再由后续新的 `running` 覆盖。

### 4. 多个 Codex 会话并存

按项目级优先级聚合：

- 任何一个等待确认，都压过运行中和已结束
- 任何一个运行中，都压过单纯已结束

### 5. 页面未挂载

即使 `ProjectDetail` 当前没打开，只要项目 tab 还在，主进程仍然可以维护项目级状态并发送通知。

## 测试建议

第一版至少验证这些场景：

1. 在内部终端启动 Codex，会显示 `运行中`
2. Codex 进入确认态时：
   - browser tab 状态更新
   - 左侧 `终端` 状态更新
   - 当前项目不可见时收到系统通知
3. Codex 会话结束时：
   - 状态更新为 `已结束`
   - 当前项目不可见时收到系统通知
4. 普通 shell / node / python 终端不出现状态
5. 多个项目同时有终端时，只更新对应项目状态
6. 应用在前台且当前项目可见时，不弹通知

## 结论

第一版采用“主进程统一状态机 + 终端运行态与输出特征混合识别”的方案：

- 只覆盖 OpenGit 内部终端里的 Codex 会话
- 只展示 `运行中 / 等待确认 / 已结束`
- 只同步到 browser 项目 tab 和 `ProjectDetail` 左侧 `终端`
- 只在 `等待确认 / 已结束` 且项目不可见或应用在后台时通知

这条方案能在不引入过多复杂度的前提下，把最有行动价值的 Codex 会话状态外提到更外层 UI。
