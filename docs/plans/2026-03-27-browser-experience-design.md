# Browser 体验优化设计（OpenGit）

## 背景
当前 Browser 体验与主流浏览器差距主要在三类：
- 响应性：多标签时 WebView 相关逻辑过重，易出现卡顿与状态抖动
- 可感知反馈：页面加载、失败、切换缺少稳定的视觉反馈
- 交互一致性：地址栏、快捷键、标签生命周期行为不统一
- 核心能力缺口：下载、Passkey/WebAuthn、会话隔离、站点权限、崩溃恢复仍明显不足

## 目标
在不引入大规模重写风险的前提下，分阶段把 Browser 从“可用”提升到“顺滑且可预期”。

## 设计原则
- 小步快跑：每一阶段都可独立发布，避免大爆炸改造
- 先体验后重构：优先做用户能立刻感知的改进
- 状态单一来源：tab 的 loading/navigation/title/favicons 由明确来源更新
- 非活跃标签降负载：减少轮询、定时器和冗余注入
- 核心站点能力补齐：优先补浏览器底层能力，再做表层 UI 打磨

## 第二轮审计新增问题（2026-03-27）

### 能力差距
1. Passkey / WebAuthn 支持不完整
   - 现象：2FA 页面提示 “This browser or device is reporting partial passkey support.”
   - 结论：当前 Browser 没有任何 WebAuthn / Passkey 专门适配逻辑，属于认证能力缺口，而不是单个站点兼容问题。
2. 下载链路缺失
   - 当前缺少下载拦截、下载列表、进度、打开目录、失败重试等浏览器基础能力。
3. 会话与权限模型过于粗糙
   - 当前所有网页共用 `persist:main`，权限请求近似全放行，缺少站点级授权管理和隐私会话。
4. 新窗口行为不一致
   - 一部分新窗口被转为新标签，一部分仍会创建新的 Electron 窗口，体验不统一。
5. 崩溃恢复和站点信息缺失
   - 缺少 render process 崩溃恢复、站点权限面板、证书/站点信息等能力。

### 性能与架构差距
1. `Browser.vue` 仍承担过多职责
   - 地址栏、导航、联想、tab 持久化、错误状态、快捷键集中在单组件，后续演进成本高。
2. `WebView.vue` 仍有较重注入与脚本执行
   - favicon、密码、页面交互仍依赖多段 `executeJavaScript` 与超时重试。
3. 后台标签页只是隐藏，不是真正冻结
   - 当前更接近 `display: none`，不是 `frozen / discarded` 生命周期。
4. 导航模型仍然双轨
   - 同时依赖 webview 原生历史和本地 `history/forwardHistory`，一致性风险高。
5. 历史/收藏/标签持久化偏重
   - 多处全量序列化、整表重载、延迟保存，交互成本高。

## 阶段规划

### Phase 1（体验快速增益）
1. 加载进度条：在工具栏增加统一 loading 反馈（开始、推进、完成）
2. 地址栏交互补齐：`Cmd/Ctrl+L` 聚焦、`Alt+Enter` 新标签打开、`Esc` 退出建议
3. 失败页体验：明确错误信息 + 一键重试

### Phase 2（性能与稳定）
1. WebView 逻辑拆分：导航状态/密码监听/菜单逻辑解耦
2. 轮询改事件驱动：密码捕获由“持续轮询”改为“命中登录页短时监听”
3. 标签生命周期：`active / warm / frozen`，降低后台标签 CPU 占用

### Phase 3（浏览器手感）
1. 会话策略：默认会话 + 隐私会话
2. 崩溃恢复：webview 崩溃检测与自动恢复
3. 快捷键矩阵完整化（新建/关闭/恢复标签、前进后退、刷新）

### Phase 4（浏览器核心能力）
1. 下载管理：接入 Electron 下载事件，补齐下载面板、状态和打开目录
2. Passkey / WebAuthn：补齐认证能力检测、交互链路和兼容性验证
3. 站点权限与站点信息：权限请求策略、权限记忆、站点信息面板
4. 新窗口统一策略：所有站点弹窗统一收敛为可配置的新标签/新窗口行为

### Phase 5（深层架构）
1. 拆分 `Browser.vue`：地址栏、标签持久化、导航控制器解耦
2. 拆分 `WebView.vue`：密码、favicon、上下文菜单拆为独立能力层
3. 统一导航状态：逐步收敛到单一历史模型
4. 标签生命周期升级：`active / warm / frozen / discarded`

## 风险与约束
- Electron `webview` 行为在不同站点上可能不一致，需要保守兼容
- 密码自动填充/捕获涉及大量站点差异，需灰度上线
- 现有 Browser 代码耦合度较高，重构阶段需保持行为不回退
- Passkey / WebAuthn 能力受 Electron 版本、平台能力和系统认证组件影响，需要单独验证 Mac/Windows 差异
- 下载、权限、会话能力一旦上线，将直接影响站点兼容性和安全策略，必须分阶段灰度

## 验收指标
- 可感知：页面加载有稳定进度反馈，失败状态可重试
- 响应性：多标签切换延迟下降，后台标签 CPU 占用降低
- 一致性：地址栏与导航快捷键行为稳定可预期

## 当前执行状态
- [x] 完成方案设计
- [x] Phase 1 - Step 1：加载进度条
- [x] Phase 1 - Step 2：地址栏快捷交互
- [x] Phase 1 - Step 3：失败页 + 重试
- [x] Phase 2 - Step 1：密码监听降轮询（登录场景短时监听）
- [x] Phase 2 - Step 2：密码监听注入去重（单入口注入）
- [x] Phase 2 - Step 3：标签生命周期（`warm/frozen/discarded` + 恢复链路）
- [x] Phase 3：会话策略 / 崩溃恢复 / 快捷键矩阵
- [x] Phase 4（基础能力）：下载管理 / 站点权限 / 新窗口策略
- [ ] Phase 4（剩余项）：Passkey / WebAuthn 兼容性修复（已完成诊断与记录）
- [x] Phase 5（阶段性）：`Browser.vue` 导航/持久化/标签状态已拆分 composables；`WebView.vue` 仅保留兼容路径

## 推荐优先级
- P0：`<webview>` 到 `WebContentsView` 的统一 Tab 架构迁移 Spike
- P0：在新架构上再做 Passkey / WebAuthn、下载管理、权限/会话基线
- P1：后台标签冻结、崩溃恢复、新窗口策略统一
- P2：地址栏排序升级、站点信息、隐私会话、多 profile

## 架构修正说明（2026-03-27）

第二轮架构评审后，原“先在 `<webview>` 路径上继续补 Passkey/下载/权限”的顺序被修正。

新的结论是：

1. `<webview>` 不再适合作为长期浏览器内核承载层
2. OpenGit 应先迁移到“统一主 tab + `WebContentsView` 承载网页 + Vue 保活内置页”的新架构
3. Passkey / 下载 / 权限 / session 等浏览器核心能力，应在新架构上继续实现，而不是继续叠加在旧 `<webview>` 主路径上

详细方案见：

- `docs/plans/2026-03-27-webcontentsview-tab-architecture-design.md`
- `docs/plans/2026-03-27-webcontentsview-tab-migration-plan.md`
