# Mist Paper Theme Design

**Goal:** Add the first light theme to the current token system so the app can be previewed in a brighter mode without abandoning the existing restrained visual language.

**Direction:** `Mist Paper` uses a soft off-white paper base, pale gray-blue surfaces, quiet blue accents, muted gold warnings, and softened rose danger states. It should feel calm and readable rather than bright, glossy, or stark white.

## Palette

- **Base surfaces:** misty paper whites and soft gray-blue neutrals
- **Primary accent:** restrained medium blue
- **Info accent:** cool slate-blue
- **Warning accent:** muted sand-gold
- **Success accent:** balanced teal-green
- **Danger accent:** softened rose red

## Token Strategy

- add a compact set of paper/light base tokens
- define a new `html[data-theme='mist-paper']` block
- explicitly set `color-scheme: light` in the theme block
- keep component usage unchanged so the theme works through the existing switcher immediately

## UI Intent

- **Backgrounds:** bright enough to read as light mode, but not pure white
- **Panels:** gentle separation, avoiding harsh border grids
- **Selection:** clearly visible but still elegant
- **Headers and tabs:** keep a little cool-blue identity so the app still feels like the same product

## Scope

This round only adds the theme and exposes it in the current theme switcher. It does not:

- make light mode the default
- redesign any component specifically for light mode
- add a separate light-mode asset set

## Success Criteria

- theme appears in the current theme switcher
- switching works immediately through the existing theme flow
- main views remain readable in light mode
- build passes with no missing token regressions
