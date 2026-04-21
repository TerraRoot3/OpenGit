# Child Header Surface Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify ProjectDetail child-page top header surfaces so they all use the same background as the stash list top bar.

**Architecture:** Promote the stash-list header background into a shared app theme token and switch child-page top bars to consume that token. Limit this pass to structural header rows and toolbar-like top areas rather than content cards or semantic accent states.

**Tech Stack:** Vue 3 SFC, scoped CSS, CSS custom properties

---

### Task 1: Add shared child-header surface token

**Files:**
- Modify: `src/App.vue`

**Step 1: Define the shared token**

Add a new global CSS variable for child-page header surfaces and keep it aligned with the current stash-list header appearance.

### Task 2: Apply the token to child-page top bars

**Files:**
- Modify: `src/components/git/ProjectStashList.vue`
- Modify: `src/components/git/ProjectPipeline.vue`
- Modify: `src/components/git/ProjectAiSessions.vue`
- Modify: `src/components/git/ProjectCommitHistory.vue`
- Modify: `src/components/git/ProjectWorkspace.vue`
- Modify: `src/components/terminal/TerminalPanel.vue`
- Modify: `src/components/terminal/FocusTerminalStack.vue`

**Step 1: Replace top-row backgrounds**

Update each child page’s top header row, tab bar, or toolbar surface to use the shared header token.

**Step 2: Keep internal content surfaces unchanged**

Do not change content cards, list items, or semantic highlight colors in this pass.

### Task 3: Verify

**Files:**
- Modify: none

**Step 1: Run build**

Run: `npm run build`
Expected: PASS
