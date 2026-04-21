# Pipeline Detail Clarity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve pipeline detail readability by clearly distinguishing tag vs branch targets and rendering status as colored text without filled background emphasis.

**Architecture:** Keep the existing `ProjectPipeline.vue` data flow and polling behavior intact. Only adjust presentation helpers and template bindings so pipeline target labels are explicit and status text uses semantic color classes instead of chip-like filled styling.

**Tech Stack:** Vue 3 SFC, `<script setup>`, scoped CSS

---

### Task 1: Clarify pipeline target type

**Files:**
- Modify: `src/components/git/ProjectPipeline.vue`

**Step 1: Add a helper that returns explicit target type text**

Update the target display helper to return `标签 · <ref>` when `pipeline.isTag` is true and `分支 · <ref>` otherwise, and expose a compact type label helper for detail view if needed.

**Step 2: Use the helper in list and detail sections**

Replace raw target text bindings so both pipeline list rows and the summary card consistently show the explicit target type.

**Step 3: Verify target display manually**

Run: `npm run build`
Expected: build succeeds and the pipeline view can render without template or style errors.

### Task 2: Render status as colored text only

**Files:**
- Modify: `src/components/git/ProjectPipeline.vue`

**Step 1: Add status text color class usage**

Use the existing status-derived class naming on list status text, detail summary status text, and job status text so status meaning is conveyed by text color only.

**Step 2: Remove filled-background appearance from status text**

Adjust scoped CSS so status text does not use chip-like background styling and remains readable on the dark card background.

**Step 3: Verify build**

Run: `npm run build`
Expected: PASS
