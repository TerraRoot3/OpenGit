# WebContentsView Browser Shell Design

## Goal

Keep the current OpenGit browser interaction model unchanged while migrating webpage rendering from DOM `<webview>` to main-process `WebContentsView`.

## User-Facing Constraints

- Keep the current unified tab bar in `Browser.vue`
- Keep current URL bar, back/forward, refresh, new tab, tab switching, and builtin page entry flows
- Keep builtin Git and utility pages accessible through the same tab model
- Allow adding browser-grade UI where needed, such as download status, permission prompts, and crash recovery

## Core Decision

The interaction model remains a single browser shell managed by `Browser.vue`, but tab content is split into two render paths:

- `web` tabs: rendered by main-process `WebContentsView`
- `builtin` tabs: rendered by existing Vue pages inside the renderer

This preserves the current product interaction while moving browser capabilities onto a better runtime primitive.

## Architecture

### Unified Browser Tab Model

`Browser.vue` remains the top-level controller for all tabs. Tabs gain an internal content kind:

- `web`
- `builtin`

The top bar, toolbar, tab ordering, tooltip behavior, route resolution, history handling, and menu entries stay in the existing shell.

### Dual Content Host

The browser content area is split conceptually into two hosts:

- Renderer host for Vue builtin pages
- Main-process host for `WebContentsView`

Only one host is visible at a time for the active tab:

- Active `builtin` tab: render Vue page and hide all `WebContentsView`
- Active `web` tab: show the matching `WebContentsView` and keep builtin content hidden

### Browser Content Adapter

The current `Browser.vue` directly manipulates `webview` instances. That coupling must be replaced by an adapter layer so the shell talks to a single interface regardless of content host.

The adapter is responsible for:

- navigate
- reload
- go back
- go forward
- activate tab content
- hide inactive web content
- receive title, favicon, URL, loading, and error state updates

`Browser.vue` continues owning tab metadata and UI state. The adapter owns content transport details.

## Main Process Responsibilities

Add a `WebContentsView` manager responsible for:

- creating and destroying one view per `web` tab
- attaching views to the main window
- activating exactly one visible web view
- syncing bounds from renderer to main process
- forwarding navigation/title/favicon/loading/error events to renderer
- handling popup, download, permission, file chooser, session, and crash-related behavior

## Renderer Responsibilities

The renderer keeps:

- current tab metadata
- builtin route rendering
- toolbar state
- tab switching and close behavior
- route resolution for builtin pages vs URLs

The renderer no longer owns DOM `webview` lifecycle for primary web tabs.

## Migration Strategy

### Phase 1

Extract browser-content control from `Browser.vue` into an internal adapter without changing behavior.

### Phase 2

Introduce a `WebContentsView` manager and IPC contract. Run one `web` tab through the new path while builtin pages stay unchanged.

### Phase 3

Switch all normal webpage tabs to `WebContentsView`, keep builtin tabs on existing Vue pages, and preserve the current shell UI.

### Phase 4

Migrate browser-grade behaviors:

- downloads
- popup/new-window handling
- permissions
- persistent session behavior
- crash recovery
- keyboard shortcuts and navigation polish

### Phase 5

Remove the old `<webview>` primary path once parity is reached.

## Risks

- `Browser.vue` currently depends heavily on live `webview` instances
- `WebContentsView` is not a DOM node, so content bounds and visibility must be synchronized carefully
- Some existing route logic mixes builtin and web assumptions inside one component
- Session and popup behavior need explicit main-process policy instead of implicit `webview` behavior

## Acceptance Criteria

- The visible browser interaction model remains unchanged
- Git and utility pages still open in the existing unified tab system
- Normal webpages use `WebContentsView`
- Toolbar state remains correct for the active web tab
- Switching between web tabs and builtin tabs is stable
- Downloads, popup handling, permissions, and crash recovery behave at least as well as the current implementation
