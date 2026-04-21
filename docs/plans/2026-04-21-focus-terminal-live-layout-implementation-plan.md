# Focus Terminal Live Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让灵动终端切换时只为当前聚焦 pane 做真实终端重排，避免未聚焦 pane 的大缓冲区会话持续参与 `fit / refresh / PTY resize`。

**Architecture:** `FocusTerminalStack` 只负责卡片切换和“何时认为布局稳定”；`TerminalPanel` 收敛成两种模式：聚焦 pane 允许真实 reflow，未聚焦 pane 只保留 live 内容和容器裁剪，不做主动 resize。

**Tech Stack:** Vue 3, xterm.js, FitAddon, Electron + node-pty

---

### Task 1: 收敛灵动终端的激活链

**Files:**
- Modify: `src/components/terminal/FocusTerminalStack.vue`

**Step 1: 保留卡片动画**

- 外层 pane 继续做位置和尺寸补间。

**Step 2: 仅在布局稳定后恢复当前 pane**

- 等几何尺寸稳定后，只调用目标 pane 的完整恢复入口。
- 不再批量恢复背景 pane。

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

### Task 2: 收紧 TerminalPanel 的单 pane 行为

**Files:**
- Modify: `src/components/terminal/TerminalPanel.vue`

**Step 1: 未聚焦 pane 不再主动 reflow**

- `ResizeObserver` 在 `singlePaneChrome + !focusPaneFocused` 时直接跳过。
- 通用 `refreshVisibleTerminal` 在未聚焦时不再进入 `scheduleViewportRevealSync`。

**Step 2: 聚焦 pane 保留唯一完整恢复入口**

- 当前 pane 在激活后执行一次完整的 `fit + refresh + viewport sync + PTY resize`。
- 保证 `codex` 等 TUI 能在最终尺寸上重新排版。

**Step 3: Run build**

Run: `npm run build`
Expected: PASS

### Task 3: 手工回归

**Files:**
- No file changes required

**Step 1: 验证 codex 聚焦恢复**

- 预期：卡片动画结束后立即恢复完整内容。

**Step 2: 验证未聚焦 pane**

- 预期：内容允许被裁剪，但不会再拖慢整个切换。

**Step 3: 验证执行中的 node/codex 任务**

- 预期：切换 pane 不会中断会话。
