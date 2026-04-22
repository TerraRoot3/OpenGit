# Workspace Editor Background Release Design

**Goal:** Reduce background workspace memory cost without hurting frequent project switching, while preserving open tabs, active file, cursor position, and scroll position.

## Problem

`ProjectWorkspace` itself is not the main problem. The heavy part is `WorkspaceTextEditor.vue`, where each mounted workspace currently owns:

- one Monaco editor instance
- one `pathToModel` map
- one `pathToViewState` map
- one resize observer and diff decoration state

This means multiple background project pages can keep multiple Monaco editor instances alive at the same time, even when the user is no longer looking at them.

## Constraints

- switching projects must stay smooth
- open file tabs and active file must remain unchanged
- cursor position and scroll position must be restored
- work should focus on workspace memory, not change project tab architecture

## Recommended Approach

Use a two-layer workspace editor design:

1. keep Monaco infrastructure shared at module scope
   - project-scoped model cache
   - project-scoped view state cache
   - shared theme / worker / language runtime remains global

2. release only the Monaco editor instance when a workspace stays in the background
   - do not destroy it immediately
   - start a short background timer
   - if the user switches back quickly, keep the current editor instance and avoid rebuild
   - if the timer expires, dispose the editor instance and layout observer only

3. recreate the editor instance on return
   - reuse cached model
   - restore cached view state
   - reload current diff decorations

## Why This Approach

This keeps the user-facing workspace state stable while removing the most expensive live object from background pages. It is less risky than unloading `ProjectWorkspace`, and it is a better fit for frequent project switching than immediate editor disposal.

## Scope

This round includes:

- module-level workspace editor session cache
- delayed editor disposal for inactive workspace editors
- editor recreation from cached model and view state
- optional debug stats for live editor/session/model counts

This round does not include:

- changing `ProjectWorkspace` tab persistence behavior
- unloading the whole workspace page
- changing terminal or pipeline lifecycle again
