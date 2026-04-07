# Session Permission Baseline Design

## Goal

Build a conservative, reusable permission baseline for browser web tabs without expanding this round into private-session UI, Passkey support, or a full site-permission center.

## Current Problem

OpenGit currently keeps all browser web content in the default persisted partition `persist:main`, but permissions are effectively unrestricted:

- `setPermissionRequestHandler` always calls `callback(true)`
- `setPermissionCheckHandler` always returns `true`

That makes the browser shell permissive by default, offers no site-level memory, and gives the user no visibility into why a page was allowed or denied.

## Scope

This round includes:

- default persisted session behavior only
- site-level permission policy in the main process
- per-origin remembered decisions
- lightweight renderer prompt for `ask` decisions
- timeout and stale-request handling

This round explicitly excludes:

- private / incognito session UI
- multiple profiles
- Passkey / WebAuthn support
- full site-permission management page
- complex decision expiry models

## Design Principles

- Keep session topology unchanged for now: continue using `persist:main`
- Move permission decisions to the main process
- Default to conservative behavior
- Only prompt for a narrow set of meaningful permissions
- Reuse the same decision pipeline for both `WebContentsView` and any remaining webview-backed paths

## Architecture

### 1. Main-Process Permission Policy Module

Add a dedicated main-process module, responsible for:

- mapping Electron permission requests into normalized policy requests
- resolving a decision from remembered rules or default policy
- queueing `ask` requests
- timing out unanswered requests
- persisting remembered allow rules by `partition + origin + permission`

Suggested storage shape:

```json
{
  "persist:main": {
    "https://example.com": {
      "media": "allow",
      "notifications": "deny"
    }
  }
}
```

Supported decisions in this round:

- `allow`
- `deny`
- `unset`

### 2. Session Model

Do not change the active browser session model in this round.

- `persist:main` remains the default web session
- `WebContentsView` and any remaining webview path should pass through the same session permission hooks

The point of this round is to fix the permission policy layer before adding more session types.

### 3. Permission Categories

First-round managed permissions:

- `media`
- `geolocation`
- `notifications`
- `clipboard-read`
- `pointerLock`

Default decisions:

- `media`: `ask`
- `geolocation`: `ask`
- `notifications`: `ask`
- `clipboard-read`: `ask`
- `pointerLock`: `deny`
- unknown permissions: `deny`

This keeps the model small and avoids pretending to support a full browser-grade permission matrix in one pass.

### 4. Origin Granularity

Remember permissions by `origin`, not full URL.

Example:

- `https://app.example.com` is one site
- `https://app.example.com/settings` does not get its own rule

This avoids rule fragmentation and matches the mental model users expect from site permissions.

## Request Flow

### Main Process

When Electron raises a permission request:

1. Normalize into:
   - `requestId`
   - `partition`
   - `origin`
   - `permission`
   - `webContentsId`
   - `tabId` if resolvable
2. Check remembered decision
3. If remembered:
   - return immediately
4. If default policy is `deny`:
   - deny immediately
   - log the reason
5. If default policy is `ask`:
   - enqueue the request
   - emit a renderer prompt event
   - wait for renderer response or timeout

### Renderer

`Browser.vue` should host a lightweight permission prompt bar inside the existing shell, near the current error / status surfaces.

Prompt actions:

- `允许一次`
- `总是允许此站点`
- `拒绝`

Behavior:

- `允许一次`: resolve current request only
- `总是允许此站点`: resolve current request and persist `allow`
- `拒绝`: resolve current request with `deny`

No full permission center is added in this round.

## Web Tab Mapping

Permission requests need to be attributable to the currently visible browser tab when possible.

`WebTabManager` should maintain lightweight lookup metadata from `webContents.id` to browser `tabId`, so the permission system can:

- identify which tab requested permission
- only surface prompts for visible / mappable web tabs

If a request cannot be mapped to an active browser tab, deny it by default.

## Error Handling

The permission layer should fail closed.

Automatically deny when:

- `origin` cannot be resolved
- `tabId` cannot be resolved for an `ask` request
- the renderer never replies
- the renderer replies after the request expired
- the app switches state such that the request is no longer valid

Every deny-by-fallback path should log a human-readable reason in the main process.

## Renderer UX

The UI must stay intentionally small:

- one visible prompt at a time
- FIFO queue
- no modal dialog
- no background-tab prompting

If multiple requests happen in parallel, the renderer displays them serially.

## Verification

Required verification for implementation:

- same-origin first permission request shows a prompt
- `允许一次` allows only the current request
- `总是允许此站点` suppresses future prompts for that same origin + permission
- background or unmapped requests are denied
- stale requests are denied after timeout
- `npm run build` passes

## Deferred Work

These items should build on this baseline later:

- private session / incognito UI
- site-permission management panel
- “always deny for this site” persistence
- permission reset controls
- Passkey / WebAuthn support
- multi-profile session partitioning
