# Home Settings Theme Switcher Design

**Goal:** Add a global theme switch entry to the home settings drawer so users can switch between `Slate Dual` and `Graphite Moss` without touching project-level settings.

## Entry Choice

The theme switcher belongs in the home settings drawer, not in project settings:

- theme is a global preference rather than a project-scoped option
- the home page already contains a general settings entry
- the existing `themeStore` already persists the active theme in local storage

## Interaction

- add a new left-side settings group: `主题设置`
- keep the existing `背景设置` group unchanged
- render one card per registered theme using `themeStore.themeDefinitions`
- clicking a card calls `themeStore.setTheme(themeId)` immediately
- the active theme uses the same selected-state language as the rest of the app

## Scope

This round only adds the switch entry and visual selection state. It does not:

- create screenshot previews
- add theme import/export
- change the default theme

## Success Criteria

- both themes appear in the home settings drawer
- switching a theme updates the app immediately
- the current theme remains selected after restart through existing persistence
