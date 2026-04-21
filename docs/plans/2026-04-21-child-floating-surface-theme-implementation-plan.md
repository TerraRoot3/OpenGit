# Child Floating Surface Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move remaining structural floating surfaces in ProjectDetail child pages onto shared theme variables so dialogs, overlays, menus, and dropdowns follow future skin changes.

**Architecture:** Reuse existing global variables such as `--app-overlay`, `--app-dialog-bg`, and `--app-menu-bg` rather than introducing a large new token set. Limit this pass to structural floating surfaces only, leaving semantic status and accent colors unchanged.

**Tech Stack:** Vue 3 SFC, scoped CSS, CSS custom properties

---

### Task 1: Align dialog and menu surfaces

**Files:**
- Modify: `src/components/git/ProjectStashList.vue`
- Modify: `src/components/git/ProjectAiSessions.vue`
- Modify: `src/components/git/ProjectCommitHistory.vue`
- Modify: `src/components/terminal/TerminalPanel.vue`

**Step 1: Replace hard-coded overlay backgrounds**

Switch modal overlays to use `--app-overlay`.

**Step 2: Replace hard-coded panel and menu backgrounds**

Switch dialog panels, context menus, and dropdown panels to use `--app-dialog-bg` or `--app-menu-bg` as appropriate.

### Task 2: Verify

**Files:**
- Modify: none

**Step 1: Run build**

Run: `npm run build`
Expected: PASS
