# Abyss Blue Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the `abyss-blue` dark theme to the formal theme token system and expose it through the existing theme switcher.

**Architecture:** Extend the shared token source with a third dark theme block and register the theme in the centralized theme definition map. Update the home theme picker preview swatch so the new option has a visible identity in settings.

**Tech Stack:** Vue 3, CSS custom properties, existing theme store

---

### Task 1: Save the design and plan docs

**Files:**
- Create: `docs/plans/2026-04-21-abyss-blue-theme-design.md`
- Create: `docs/plans/2026-04-21-abyss-blue-theme-implementation-plan.md`

### Task 2: Add the theme tokens

**Files:**
- Modify: `src/theme/tokens.css`

**Step 1: Add supporting ocean-blue base colors**

Introduce a compact set of navy and mist-blue base tokens used only where the new theme needs them.

**Step 2: Add the `abyss-blue` theme block**

Define the semantic and component alias tokens for the new theme.

### Task 3: Register and expose the theme

**Files:**
- Modify: `src/theme/themes.js`
- Modify: `src/components/HomePage.vue`

**Step 1: Register the theme**

Add `abyss-blue` to the theme definitions so the store recognizes it.

**Step 2: Add a picker swatch**

Add the theme preview swatch style used by the home settings theme picker.

### Task 4: Verify integration

**Files:**
- Modify: none

**Step 1: Run the build**

Run: `npm run build`

Expected: successful production build with the new theme available in settings.
