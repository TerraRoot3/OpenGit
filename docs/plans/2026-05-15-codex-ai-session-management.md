# Codex AI Session Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Codex-only session rename and archive support in the project AI session panel, matching Codex behavior where archived sessions are no longer listed.

**Architecture:** Extend the Electron AI session IPC layer with Codex-specific rename and archive operations backed by `~/.codex/session_index.jsonl` and `~/.codex/archived_sessions/`. Keep Claude behavior unchanged. Update the Vue session panel to expose rename and archive only for Codex sessions and refresh the in-memory list after mutations.

**Tech Stack:** Electron IPC, Node.js filesystem APIs, Vue 3 `<script setup>`, existing project AI session panel

---

### Task 1: Codex IPC operations

**Files:**
- Modify: `electron/ipc/ai-sessions.js`
- Test: `scripts/test-codex-ai-session-management.js`

**Step 1: Write the failing test**

Test for:
- missing exported Codex rename/archive helpers
- rename updates the loaded Codex title via appended `session_index.jsonl` row
- archive moves the source file into `.codex/archived_sessions`
- archived sessions no longer appear in `loadCodexSessions()`

**Step 2: Run test to verify it fails**

Run: `node scripts/test-codex-ai-session-management.js`
Expected: FAIL because rename/archive helpers do not exist yet

**Step 3: Write minimal implementation**

Implement:
- shared Codex root resolver
- `renameCodexSession(...)`
- `archiveCodexSessionSource(...)`
- IPC handlers for rename/archive

**Step 4: Run test to verify it passes**

Run: `node scripts/test-codex-ai-session-management.js`
Expected: PASS

### Task 2: Preload API wiring

**Files:**
- Modify: `electron/preload.js`

**Step 1: Expose new IPC methods**

Add:
- `renameProjectAiSession(data)`
- `archiveProjectAiSession(data)`

**Step 2: Verify wiring**

Run: `node -c electron/preload.js`
Expected: PASS

### Task 3: Codex session UI

**Files:**
- Modify: `src/components/git/ProjectAiSessions.vue`

**Step 1: Add Codex-only actions**

Add:
- inline `重命名` button
- inline `归档` button replacing delete only for Codex
- dialog footer `重命名` and `归档会话` actions for Codex

**Step 2: Add rename/archive dialogs and state**

Implement:
- rename draft state and confirm flow
- archive confirmation copy that clearly says archived sessions disappear from the list

**Step 3: Refresh and sync session state**

After rename:
- reload sessions
- keep current dialog open with refreshed title

After archive:
- reload sessions
- close summary dialog if the archived session was open

**Step 4: Run build verification**

Run: `npm run build`
Expected: PASS
