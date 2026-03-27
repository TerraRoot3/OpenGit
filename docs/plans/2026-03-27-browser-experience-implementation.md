# Browser Experience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提升 OpenGit Browser 交互体验，分阶段交付可感知改进并保持现有功能稳定。

**Architecture:** 先在 `Browser.vue` 做可视化反馈与交互修复，再逐步下沉 `WebView.vue` 的高耦合逻辑。每个阶段以“可构建 + 可手动验证”为结束条件，避免一次性重构。

**Tech Stack:** Vue 3, Electron webview, Vite, composables

---

### Task 1: 加载进度条（Phase 1 - Step 1）

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Test: 手工验证 + `npm run build`

**Step 1: 实现 tab 级加载进度状态**
- 新增状态：`loadingProgressByTab`、`progressTimerByTab`（Map）
- 在 `onLoadStart` 启动进度动画（例如 10% -> 80% 缓慢增长）
- 在 `onLoadStop`/`onLoadFail` 收尾到 100% 并隐藏

**Step 2: 增加工具栏进度条 UI**
- 在工具栏下方增加细进度条
- 活跃标签加载时显示，停止后渐隐

**Step 3: 验证构建与交互**
- Run: `npm run build`
- 手工验证：打开网页、切换标签、加载失败场景

---

### Task 2: 地址栏快捷交互（Phase 1 - Step 2）

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Test: 手工验证 + `npm run build`

**Step 1: 全局快捷键**
- `Cmd/Ctrl + L` 聚焦地址栏并全选
- `Escape` 关闭联想提示

**Step 2: `Alt+Enter` 新标签打开**
- 在地址栏键盘处理里支持 `Alt+Enter`
- 保持当前 Enter 行为不变

**Step 3: 验证**
- Run: `npm run build`
- 手工验证上述快捷键行为

---

### Task 3: 加载失败页与重试（Phase 1 - Step 3）

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/webview/WebView.vue`
- Test: 手工验证 + `npm run build`

**Step 1: 失败状态标准化**
- 统一 `did-fail-load` 主框架失败的错误展示数据

**Step 2: UI 与重试**
- 在 Browser 内容区显示失败页（错误码/描述）
- 提供“重试当前地址”按钮

**Step 3: 验证**
- Run: `npm run build`
- 手工验证错误页与重试

---

### Task 4: WebView 密码逻辑降轮询（Phase 2 - Step 1）

**Files:**
- Modify: `src/components/webview/WebView.vue`
- Test: 手工验证 + `npm run build`

**Step 1: 限定监听窗口**
- 仅命中登录页后开启短时监听，退出页面即停止

**Step 2: 清理重复注入**
- 抽出注入入口，避免多次注入同类脚本

**Step 3: 验证**
- Run: `npm run build`
- 手工验证登录页自动填充/保存

---

### Task 5: 标签生命周期策略（Phase 2 - Step 2）

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/webview/WebView.vue`
- Test: 手工验证 + `npm run build`

**Step 1: 定义生命周期状态**
- active/warm/frozen

**Step 2: 冻结非活跃标签后台任务**
- 停止轮询、暂停非必要任务

**Step 3: 验证**
- Run: `npm run build`
- 手工验证切换标签和资源占用变化

---

### Task 6: Passkey / WebAuthn 能力审计与补齐（Phase 4 - P0）

**Files:**
- Modify: `electron/main.js`
- Modify: `src/components/webview/WebView.vue`
- Modify: `src/components/browser/Browser.vue`
- Test: 手工验证 + 真实 Passkey 登录页

**Step 1: 建立能力基线**
- 明确当前 Electron / Chromium 对 Passkey 的支持边界
- 确认当前 “partial passkey support” 的具体触发条件

**Step 2: 设计交互兜底**
- 至少能识别“不支持 / 部分支持 / 可正常调用”三种状态
- 对不可用场景给出明确反馈，而不是让页面静默失败

**Step 3: 验证**
- 用至少一个真实 2FA Passkey 页面验证

---

### Task 7: 下载管理基础能力（Phase 4 - P0）

**Files:**
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `src/components/browser/Browser.vue`
- Create: `src/components/browser/DownloadPanel.vue`

**Step 1: 主进程接管下载生命周期**
- 监听开始、进度、完成、失败

**Step 2: 前端增加下载面板**
- 展示进度、状态、打开目录、失败重试

**Step 3: 验证**
- 下载真实文件验证全链路

---

### Task 8: 会话与权限模型（Phase 4 - P0）

**Files:**
- Modify: `electron/main.js`
- Modify: `src/components/browser/Browser.vue`
- Create: `src/components/browser/SitePermissionPanel.vue`

**Step 1: 从“全放行”改为策略控制**
- 针对媒体、剪贴板、通知等权限定义最小可用策略

**Step 2: 增加隐私会话**
- 在默认会话外提供独立隐私会话能力

**Step 3: 验证**
- 用代表性站点验证授权行为

---

### Task 9: 崩溃恢复与新窗口策略统一（Phase 4 - P1）

**Files:**
- Modify: `electron/main.js`
- Modify: `src/components/webview/WebView.vue`
- Modify: `src/components/browser/Browser.vue`

**Step 1: 捕获崩溃/无响应**
- 增加恢复、重载、关闭页签动作

**Step 2: 统一 `window.open` 行为**
- 收敛为一套新标签/新窗口规则

**Step 3: 验证**
- 通过异常场景手工验证恢复路径

---

### Task 10: Browser / WebView 深层拆分（Phase 5 - P1）

**Files:**
- Modify: `src/components/browser/Browser.vue`
- Modify: `src/components/webview/WebView.vue`

**Step 1: 拆 Browser 控制器**
- 地址栏、导航、tab 持久化解耦

**Step 2: 拆 WebView 能力层**
- favicon、密码、上下文菜单独立

**Step 3: 验证**
- Run: `npm run build`
- 手工验证浏览器关键路径

---

## 当前建议的实施顺序

1. 先执行 `docs/plans/2026-03-27-webcontentsview-tab-migration-plan.md` 中的统一 Tab + `WebContentsView` Spike
2. 再做 Task 6：Passkey / WebAuthn 审计与补齐
3. 再做 Task 7：下载管理
4. 再做 Task 8：会话与权限模型
5. 最后做 Task 9 / Task 10 的稳定性与深层拆分
