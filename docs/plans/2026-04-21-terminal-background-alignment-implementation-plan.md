# Terminal Background Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align terminal-related views with the ProjectDetail background color system so terminal pages no longer show mismatched hard-coded dark backgrounds.

**Architecture:** Update terminal container styles to use `var(--app-project-bg)` consistently and replace hard-coded xterm background values with a runtime-resolved theme color derived from the same app variable. Keep all terminal behavior unchanged outside visual background alignment.

**Tech Stack:** Vue 3 SFC, xterm.js theme options, scoped CSS

---

### Task 1: Unify terminal container backgrounds

**Files:**
- Modify: `src/components/terminal/FocusTerminalStack.vue`
- Modify: `src/components/terminal/StandaloneTerminal.vue`
- Modify: `src/components/terminal/StandaloneSplitTerminal.vue`
- Modify: `src/components/terminal/TerminalSplitNode.vue`

**Step 1: Replace terminal container background tokens**

Update terminal wrapper styles that still use `--app-workspace-bg`, `--app-surface-1`, or hard-coded dark colors for their base background so they resolve to `var(--app-project-bg)` instead.

**Step 2: Keep semantic overlays unchanged**

Leave drag/drop, warning, hover, and active overlays intact so only the base background is aligned.

### Task 2: Align xterm canvas background

**Files:**
- Modify: `src/components/terminal/terminalXtermOptions.mjs`
- Modify: `src/components/terminal/TerminalPanel.vue`

**Step 1: Add runtime theme resolution**

Introduce a helper that derives the xterm theme background from `--app-project-bg` with a stable fallback, and use it when creating a terminal instance.

**Step 2: Preserve scrollback updates**

Ensure the scrollback fallback path still reuses the resolved theme instead of reverting to a hard-coded xterm background.

### Task 3: Verify

**Files:**
- Modify: none

**Step 1: Run build verification**

Run: `npm run build`
Expected: PASS
