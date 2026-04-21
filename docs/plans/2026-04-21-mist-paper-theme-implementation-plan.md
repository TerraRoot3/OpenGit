# Mist Paper Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the `mist-paper` light theme to the formal theme token system and expose it through the existing theme switcher.

**Architecture:** Extend the shared token source with a first light-theme block, register it in the theme definition map, and add a matching preview swatch in the home settings theme picker.

**Tech Stack:** Vue 3, CSS custom properties, existing theme store

---

### Task 1: Save the design and plan docs

**Files:**
- Create: `docs/plans/2026-04-21-mist-paper-theme-design.md`
- Create: `docs/plans/2026-04-21-mist-paper-theme-implementation-plan.md`

### Task 2: Add the theme tokens

**Files:**
- Modify: `src/theme/tokens.css`

**Step 1: Add light-mode base colors**

Introduce the off-white, paper, mist, and soft accent base tokens needed by the new theme.

**Step 2: Add the `mist-paper` block**

Define semantic and component alias tokens, including `color-scheme: light`.

### Task 3: Register and expose the theme

**Files:**
- Modify: `src/theme/themes.js`
- Modify: `src/components/HomePage.vue`

**Step 1: Register the theme**

Add `mist-paper` to the theme definition map.

**Step 2: Add a picker swatch**

Add the preview swatch style for the theme card.

### Task 4: Verify integration

**Files:**
- Modify: none

**Step 1: Run the build**

Run: `npm run build`

Expected: successful production build with the new light theme available in settings.
