# App Shell Project Sidebar Design

## Goal

Redesign the application homepage into a two-pane shell:

- a global, resizable, collapsible project sidebar on the left
- the existing Browser experience on the right, unchanged as the main workspace

The sidebar becomes the global project navigation surface. The right side continues to own tabs, toolbar, web content, `ProjectDetail`, `GitProject`, and all existing page types.

## Current Constraints

- `src/App.vue` mounts `Browser` directly, so the application currently has no outer shell.
- `src/components/browser/Browser.vue` already owns the full right-side workspace behavior:
  - browser tabs
  - toolbar
  - content host
  - route-type based page rendering
- `src/components/browser/NewTabPage.vue` already routes project content correctly:
  - `clone-directory` -> `GitProject`
  - `single-project` -> `ProjectDetail`
- `src/components/git/GitProject.vue` still contains its own left-side project list layout. That structure conflicts with the new global sidebar and must be reduced to a directory-content page role.

## Product Rules

### Layout

- The app root becomes a left-right shell.
- Left sidebar is always available, but can be collapsed by the user.
- Sidebar width is adjustable by drag and persisted.
- The entire current Browser UI moves into the right pane as-is.

### Sidebar Behavior

- Users can add one or more scan roots by choosing directories.
- Each added directory is treated as a scan root.
- A scan root is allowed to also be a Git repository.
- Even when the scan root itself is a Git repository, the app still scans child directories up to depth 3.
- Only Git repositories discovered within 3 directory levels are listed as child repository items.

### Open Behavior

- Clicking a scan root:
  - opens `ProjectDetail` if the root itself is a Git repo
  - opens `GitProject` if the root is a normal directory
- Clicking a child repository always opens `ProjectDetail`
- Reuse rules:
  - same absolute path -> reuse existing tab
  - different absolute path -> create a new tab

### Expansion Behavior

- Each scan root is expandable/collapsible.
- Expansion state is persisted.
- Sidebar exposes global actions:
  - expand all
  - collapse all

## Recommended Architecture

### 1. New outer application shell

Introduce an application shell component above `Browser`.

Responsibilities:

- render left sidebar
- render right Browser pane
- own split layout state
- coordinate project navigation actions into Browser tabs

Recommended placement:

- create `src/components/app/AppShell.vue`
- update `src/App.vue` to mount `AppShell`

### 2. New global project sidebar domain

Do not extend the existing `projectStore.js` for this concern. The current store is oriented around project details and scan-path project lists. The new sidebar is an application navigation domain and needs separate persistence and UI state.

Recommended new store:

- `src/stores/projectSidebarStore.js`

Responsibilities:

- scan roots
- scan results
- sidebar width
- collapsed state
- search query
- expanded root state
- persistence and restore

### 3. Browser remains the workspace owner

`Browser.vue` should continue to own:

- tab strip
- toolbar
- route/page rendering
- webview lifecycle
- content routing

The new sidebar should not be embedded back into `Browser.vue`. The app shell should instead call Browser-level navigation methods through a controlled interface or shared browser tab store/composable.

### 4. Directory scanning in Electron

Current project scanning support exists, but the new sidebar needs a more explicit scan-root model.

Recommended IPC addition:

- new IPC method dedicated to scan roots and nested repository discovery

Suggested return shape:

```js
{
  root: {
    path: "/abs/root",
    name: "OpenGit",
    isGitRepo: true
  },
  repositories: [
    {
      path: "/abs/root",
      name: "OpenGit",
      depth: 0,
      isRoot: true
    },
    {
      path: "/abs/root/packages/foo",
      name: "foo",
      depth: 2,
      isRoot: false
    }
  ]
}
```

The sidebar UI can still display the root separately while using the repository list for child items.

## Data Model

```js
scanRoots = [
  {
    path: "/abs/root",
    name: "OpenGit",
    isGitRepo: true,
    expanded: true,
    children: [
      {
        path: "/abs/root/sub/repo-a",
        name: "repo-a",
        depth: 2
      }
    ],
    lastScannedAt: 1710000000000
  }
]

sidebarUi = {
  width: 320,
  collapsed: false,
  searchQuery: "",
  expandedRootPaths: ["/abs/root"]
}
```

## Component Boundaries

### `AppShell.vue`

- owns left-right layout
- owns drag-resize interaction
- owns collapsed state binding
- bridges sidebar clicks to Browser navigation

### `ProjectSidebar.vue`

- renders scan roots
- renders child repositories
- handles search filtering
- emits navigation intents
- emits add-root requests
- emits expand/collapse actions

### `Browser.vue`

- no global sidebar responsibility
- accepts open/reuse project navigation requests through exposed methods or shared state

### `GitProject.vue`

- must become a right-pane directory page, not a two-column page
- should no longer render its own internal project sidebar in the redesigned shell path

## Persistence

Persist the following locally:

- scan root paths
- scan root expanded state
- sidebar width
- sidebar collapsed state

Persisted open tabs continue to be handled by the existing browser persistence flow.

## Search Behavior

- Sidebar search filters across:
  - scan root name
  - scan root path
  - child repository name
  - child repository path
- Filtering should not destroy stored expansion state.
- Matching child repositories under a collapsed root should still surface by auto-showing their root container in filtered mode.

## Risks

### `GitProject.vue` currently duplicates the left-nav concept

This is the main structural conflict. If not addressed, the redesign will produce nested navigation and confused selection state.

### Browser tab reuse logic is currently distributed

The new “same path reuse, different path new tab” rule must be centralized, otherwise the sidebar and existing internal entry points will diverge.

### Scan behavior needs explicit depth control

The Electron scan implementation must guarantee:

- maximum depth 3
- stable ordering
- no duplicate repository entries
- acceptable performance on large directories

## Recommendation

Implement the redesign as an app-shell refactor, not as a Browser-local UI change.

This keeps the current Browser intact as the workspace engine, while turning project navigation into a first-class application concern.
