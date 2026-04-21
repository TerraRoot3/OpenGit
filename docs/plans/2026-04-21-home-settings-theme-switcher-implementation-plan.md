# Home Settings Theme Switcher Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a theme selector to the home settings drawer using the existing global theme store and theme registry.

**Architecture:** Extend `HomePage.vue` with a new settings group and render theme cards from `themeStore.themeDefinitions`. Reuse the existing global `setTheme` flow so switching stays centralized and persisted.

**Tech Stack:** Vue 3 `<script setup>`, CSS custom properties, existing theme store

---

### Task 1: Document the design

**Files:**
- Create: `docs/plans/2026-04-21-home-settings-theme-switcher-design.md`
- Create: `docs/plans/2026-04-21-home-settings-theme-switcher-implementation-plan.md`

**Step 1: Save the design summary**

Describe why the switcher belongs in the home settings drawer and how theme cards behave.

**Step 2: Save the implementation plan**

Record the exact file changes and verification command.

### Task 2: Add the home settings theme UI

**Files:**
- Modify: `src/components/HomePage.vue`

**Step 1: Connect the theme store**

Import `useThemeStore`, create theme option data, and expose the current theme and setter to the template.

**Step 2: Add the new settings group**

Extend the left sidebar with a `主题设置` entry and render a theme card list on the right.

**Step 3: Style the new controls**

Align the theme cards with the existing dark drawer language and selected state system.

### Task 3: Verify integration

**Files:**
- Modify: none

**Step 1: Run the build**

Run: `npm run build`

Expected: successful production build with the new theme selector integrated.
