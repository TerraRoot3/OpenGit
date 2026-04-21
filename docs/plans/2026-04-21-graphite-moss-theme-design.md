# Graphite Moss Theme Design

**Goal:** Add a second dark theme with a natural, restrained visual direction that clearly differs from `slate-dual` while preserving long-session readability for code, terminal, and workspace views.

**Direction:** `Graphite Moss` uses graphite-charcoal surfaces with a moss-teal primary accent, sand-toned warnings, and muted clay danger states. The palette should feel calmer and less cold than the current slate-blue theme without becoming brown, vintage, or low-contrast.

## Palette

- **Base surfaces:** warmer graphite with a subtle green undertone
- **Primary accent:** moss-teal for selected states, active tabs, primary actions, and progress
- **Info accent:** mist green-blue for links and informational emphasis
- **Warning accent:** dry sand / muted gold
- **Success accent:** sage green, softer than the current bright green
- **Danger accent:** muted clay red instead of high-saturation red

## Token Strategy

The theme should only define `--theme-sem-*` and `--theme-comp-*` tokens and rely on the existing base/semantic/component layering already established in `src/theme/tokens.css`.

To support the new palette cleanly:

- add a small set of reusable graphite, moss, mist, sand, sage, and clay base tokens
- define a new `html[data-theme='graphite-moss']` block
- keep the existing component alias structure unchanged so migrated components inherit the new look automatically

## UI Intent

- **Backgrounds:** less blue, slightly warmer, still clearly dark
- **Selection:** moss-tinted surfaces rather than steel-blue
- **Tabs and navigation:** active states should feel grounded and organic, not electric
- **Status colors:** softer, less saturated semantic colors that remain readable on dark surfaces

## Scope

This round only adds the theme definition and registry entry. It does not:

- change any component structure
- make `graphite-moss` the default theme
- introduce a new theme switcher UI

## Success Criteria

- theme can be activated through the existing `data-theme` flow
- current components render correctly without missing token references
- visual contrast remains safe for the main work surfaces
- build passes with no new runtime theme dependencies
