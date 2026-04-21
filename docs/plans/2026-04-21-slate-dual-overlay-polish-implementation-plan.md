# Slate Dual Overlay Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish `Slate Dual` floating surfaces by adjusting only theme token values.

**Architecture:** Update the `slate-dual` semantic surface, border, and hover tokens in `src/theme/tokens.css` so menus, dialogs, and dropdowns inherit stronger contrast automatically.

**Tech Stack:** CSS custom properties, existing theme token system

---

### Task 1: Document the polish scope

**Files:**
- Create: `docs/plans/2026-04-21-slate-dual-overlay-polish-design.md`
- Create: `docs/plans/2026-04-21-slate-dual-overlay-polish-implementation-plan.md`

### Task 2: Refine overlay tokens

**Files:**
- Modify: `src/theme/tokens.css`

**Step 1: Adjust floating surfaces**

Slightly rebalance dialog, menu, tooltip, and overlay values for better separation.

**Step 2: Adjust hover strength**

Increase hover visibility for overlay-driven interactions while preserving the same geometry and component styles.

### Task 3: Verify integration

**Files:**
- Modify: none

**Step 1: Run the build**

Run: `npm run build`

Expected: successful production build with no theme regressions.
