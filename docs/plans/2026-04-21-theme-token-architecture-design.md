# Theme Token Architecture Design

## Goal

Establish a formal theme token structure that supports future dark and light themes without forcing an immediate component refactor.

## Strategy

Use a three-layer token model:

1. Base tokens
   Raw colors, radii, and primitive values.
2. Semantic tokens
   UI meaning such as app background, text, hover, success, warning, and danger.
3. Component alias tokens
   Focused mappings for navigation, tabs, child headers, and other repeated surfaces.

## Migration Plan

1. Move theme variables out of `App.vue` into dedicated theme files.
2. Define base, semantic, and alias tokens for the current `slate-dual` dark theme.
3. Keep legacy `--app-*` variables as compatibility aliases so existing components do not need to change immediately.
4. Expand the theme store from a single hardcoded theme id to a theme definition registry that can later power a real switcher UI.

## Initial Scope

- Only dark theme values are provided in this round.
- No component-level variable renaming is required yet.
- Existing visuals should remain effectively unchanged after the refactor.

## Next Steps

- Add additional dark theme variants by overriding semantic and alias tokens per theme id.
- Gradually migrate components from legacy `--app-*` aliases to formal `--theme-*` tokens.
- Introduce light-theme values after the semantic coverage is stable enough.
