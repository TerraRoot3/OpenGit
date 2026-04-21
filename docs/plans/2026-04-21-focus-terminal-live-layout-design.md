# Focus Terminal Live Layout Design

**Goal:** 保留灵动终端的卡片切换动画，同时把大缓冲区终端的重排成本收敛到当前聚焦 pane，避免 `codex` 一类会话在切换时卡顿、延迟重算和内容错乱。

**Context**

- 当前 `liquid` 终端的外层卡片会做 `left/top/width/height` 动画。
- 问题不在卡片动画本身，而在所有 pane 都试图在动画期间或动画刚结束时做真实 `fit / refresh / PTY resize`。
- 对 `codex` 这类缓冲区很大的 TUI，会直接把主线程和 PTY 都拖重。

**Root Cause**

1. “所有 pane 都实时跟随容器尺寸重排”这个目标本身过于激进，尤其是大缓冲区终端。
2. 非聚焦 pane 的内容其实不需要始终完美，只要当前聚焦 pane 完整可用即可。
3. 之前的方案把“当前 pane 恢复”和“其它 pane 收窄”绑在同一条同步链里，导致聚焦恢复被拖慢。

**Chosen Approach**

- 卡片动画保留。
- 终端内容不做动画，只有容器做布局补间。
- 未聚焦 pane 不再参与 `ResizeObserver` 驱动的 reflow，也不再走通用 `fit / viewport sync`。
- 未聚焦 pane 只保留 live 会话和容器裁剪效果，内容允许暂时不完美。
- 当前聚焦 pane 在卡片几何尺寸稳定后，立即执行唯一一次完整恢复：
  1. `fit`
  2. `refresh`
  3. `viewport sync`
  4. `scrollToBottom / focus`
  5. 最终 PTY resize

**Expected Result**

- 卡片动画仍然顺滑。
- 当前聚焦 pane 在动画结束后立即恢复到正确尺寸。
- 非聚焦 pane 不再因为大缓冲区实时重排拖慢整个交互。
- `codex` 一类会话在切换时的卡顿会明显下降。
