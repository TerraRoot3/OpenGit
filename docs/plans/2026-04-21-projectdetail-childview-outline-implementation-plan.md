# ProjectDetail Child View Outline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a unified outline around the ProjectDetail child-view area so all right-side subpages share one consistent rounded border.

**Architecture:** Apply the outline at the shared `.right-panel` container in `ProjectDetail.vue` instead of touching each child page. Reuse the existing border radius token and a subtle theme-compatible border color so the change remains stable across view switches and future theme work.

**Tech Stack:** Vue 3 SFC, scoped CSS

---

### Task 1: Add shared child-view outline

**Files:**
- Modify: `src/components/git/ProjectDetail.vue`

**Step 1: Update the shared right-panel container**

Add a subtle border or inset outline to `.right-panel`, keep `overflow: hidden`, and switch the border radius to `var(--app-selected-radius)` so all mounted child views inherit the same rounded outer shape.

**Step 2: Preserve child sizing behavior**

Keep the existing `.right-panel > *` flex sizing so subpages still fill the panel without layout regressions.

### Task 2: Verify

**Files:**
- Modify: none

**Step 1: Run build**

Run: `npm run build`
Expected: PASS
