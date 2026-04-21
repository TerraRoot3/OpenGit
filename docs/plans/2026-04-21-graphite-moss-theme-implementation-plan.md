# Graphite Moss Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the `graphite-moss` dark theme to the formal token system so the existing theme switch pipeline can activate it without component code changes.

**Architecture:** Extend the shared token source with a second dark theme block and register the theme in the central theme definition map. Reuse the current semantic/component contract so all migrated components automatically inherit the new palette.

**Tech Stack:** Vue 3, CSS custom properties, existing theme store

---

### Task 1: Add the theme design docs

**Files:**
- Create: `docs/plans/2026-04-21-graphite-moss-theme-design.md`
- Create: `docs/plans/2026-04-21-graphite-moss-theme-implementation-plan.md`

**Step 1: Write the design summary**

Document the natural-material direction, palette intent, scope, and success criteria.

**Step 2: Save the implementation plan**

Capture the exact files to modify and the verification command.

### Task 2: Extend the token source

**Files:**
- Modify: `src/theme/tokens.css`

**Step 1: Add supporting base colors**

Introduce the graphite, moss, mist, sand, sage, and clay base tokens needed by the new theme.

**Step 2: Add the `graphite-moss` semantic/component block**

Define the full `html[data-theme='graphite-moss']` token set using the existing semantic/component contract.

### Task 3: Register the theme

**Files:**
- Modify: `src/theme/themes.js`

**Step 1: Add the new theme definition**

Register `graphite-moss` with label and dark appearance metadata.

**Step 2: Preserve current default behavior**

Keep `slate-dual` as the default until the user explicitly wants the new theme enabled by default.

### Task 4: Verify integration

**Files:**
- Modify: none

**Step 1: Run the build**

Run: `npm run build`

Expected: successful production build with no missing token or theme import failures.
