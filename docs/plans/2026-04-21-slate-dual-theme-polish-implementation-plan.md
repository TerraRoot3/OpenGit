# Slate Dual Theme Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the `slate-dual` theme by adjusting only token values in the shared theme source.

**Architecture:** Update the `html[data-theme='slate-dual']` semantic and component tokens in `src/theme/tokens.css` so all existing components inherit the refinement automatically.

**Tech Stack:** CSS custom properties, existing theme token system

---

### Task 1: Document the polish scope

**Files:**
- Create: `docs/plans/2026-04-21-slate-dual-theme-polish-design.md`
- Create: `docs/plans/2026-04-21-slate-dual-theme-polish-implementation-plan.md`

**Step 1: Save the design note**

Document the hierarchy, selection, header, and text-contrast refinements.

**Step 2: Save the implementation plan**

Record the token-only change scope and verification command.

### Task 2: Refine the theme tokens

**Files:**
- Modify: `src/theme/tokens.css`

**Step 1: Adjust text hierarchy**

Slightly rebalance `primary`, `secondary`, and `muted` values.

**Step 2: Adjust selection and active-state tokens**

Refine selected, sidebar-active, and tab-active tokens for clearer separation.

**Step 3: Adjust child header and semantic accents**

Give child headers a cooler surface tint and slightly soften semantic status colors.

### Task 3: Verify integration

**Files:**
- Modify: none

**Step 1: Run the build**

Run: `npm run build`

Expected: successful production build with no theme token regressions.
