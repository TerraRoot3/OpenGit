# Workspace Panel Surface Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace remaining workspace panel and floating surface hard-coded colors with app theme variables so the workspace is ready for one-click theme switching.

**Architecture:** Reuse existing global theme variables such as `--app-project-bg`, `--app-menu-bg`, and `--app-dialog-bg` rather than introducing a large new token set. Limit this pass to structural surfaces and floating panels, leaving semantic accent colors unchanged.

**Tech Stack:** Vue 3 SFC, scoped CSS, CSS custom properties

---

### Task 1: Align workspace panel surfaces

**Files:**
- Modify: `src/components/git/ProjectWorkspace.vue`

**Step 1: Update panel background surfaces**

Replace the tab bar background and bottom action panel background with `--app-project-bg`-driven surfaces instead of unrelated sidebar or hard-coded dark fills.

**Step 2: Update menu surfaces**

Replace tree filter menu and context menu hard-coded backgrounds with `--app-menu-bg`.

### Task 2: Align editor floating surfaces

**Files:**
- Modify: `src/components/git/WorkspaceTextEditor.vue`

**Step 1: Update change navigation surface**

Replace the change navigation floating bar background with a `--app-project-bg`-based color mix so it follows theme changes.

**Step 2: Preserve control contrast**

Keep button and text contrast behavior intact while only moving the panel surface to theme variables.

### Task 3: Verify

**Files:**
- Modify: none

**Step 1: Run build**

Run: `npm run build`
Expected: PASS
