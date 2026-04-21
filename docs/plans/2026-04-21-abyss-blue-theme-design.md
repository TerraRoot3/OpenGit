# Abyss Blue Theme Design

**Goal:** Add a third dark theme with a calm, professional blue direction that is clearly distinct from both `Slate Dual` and `Graphite Moss`.

**Direction:** `Abyss Blue` is built around deep ocean-blue surfaces, misty blue highlights, restrained silver-blue informational accents, muted warm warnings, and softened coral danger states. It should feel deeper and more atmospheric than `Slate Dual`, not brighter or more electric.

## Palette

- **Base surfaces:** deep navy-blue charcoal with clear but controlled blue separation
- **Primary accent:** abyss blue for selected states, active tabs, and primary actions
- **Info accent:** silver-blue / mist blue for subtle emphasis
- **Warning accent:** warm muted gold to keep the theme from becoming overly cold
- **Success accent:** cool seafoam green
- **Danger accent:** softened coral red

## Token Strategy

The theme uses the existing semantic/component contract:

- add a compact set of ocean-blue base tokens
- define a new `html[data-theme='abyss-blue']` block
- keep all component usage unchanged so the theme becomes available through the existing switcher automatically

## UI Intent

- **Backgrounds:** deeper and more immersive than `Slate Dual`
- **Navigation and tabs:** active states should feel precise and cool, not flashy
- **Floating surfaces:** slightly separated from page surfaces with a subtle marine cast
- **Status colors:** still readable on dark surfaces, but tuned to the colder palette

## Scope

This round only adds the theme definition and makes it available through the current theme switcher. It does not:

- change the default theme
- redesign the theme picker
- introduce any component-specific overrides

## Success Criteria

- theme appears in the existing home settings theme switcher
- switching works immediately through the current `data-theme` flow
- theme remains clearly distinguishable from both `Slate Dual` and `Graphite Moss`
- build passes with no missing token regressions
