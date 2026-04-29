# OpenGit Embedded MCP

Date: 2026-04-29

## Overview

OpenGit can start a built-in local MCP server from the Electron main process.

Current characteristics:

- localhost only: `127.0.0.1`
- no token required
- disabled by default
- write capabilities are available but disabled by default

The server is designed so that:

- external AI tools can discover OpenGit projects directly
- AI can read terminal output without scraping the UI
- AI can inspect GitLab / GitHub / Gitee repository metadata and pipelines through OpenGit's saved configuration

## How to Enable

In OpenGit:

1. Open the Home settings drawer
2. Find the `MCP 服务` section
3. Enable the service
4. Keep or change the local port
5. Toggle the capability groups you want

Default endpoint:

```text
http://127.0.0.1:3765/mcp
```

## Protocol Notes

This first version exposes a minimal MCP-compatible JSON-RPC surface over HTTP.

Supported methods:

- `initialize`
- `tools/list`
- `tools/call`
- `ping`

Status endpoint:

```text
GET http://127.0.0.1:3765/status
```

## Tool Groups

### Projects

- `projects.list`
- `projects.find`
- `projects.get`
- `projects.get_active`
- `projects.get_open_tabs`

Typical use cases:

- find all saved repositories
- resolve the current active project path
- map project names to absolute paths

### Terminals

- `terminals.list`
- `terminals.get_output`
- `terminals.get_project_outputs`
- `terminals.get_recent_errors`
- `terminals.tail`
- `terminals.write`

Typical use cases:

- inspect recent terminal output
- analyze project logs
- extract recent error snippets for diagnosis
- continuously read new terminal output using cursors
- write text or commands into an existing OpenGit terminal session

### Remotes

- `remotes.detect_provider`
- `remotes.get_repo`
- `remotes.list_branches`
- `remotes.list_merge_requests`
- `remotes.list_pull_requests`
- `remotes.list_pipelines`
- `remotes.get_pipeline`
- `remotes.create_merge_request`
- `remotes.create_pull_request`
- `remotes.comment_merge_request`
- `remotes.comment_pull_request`
- `remotes.rerun_pipeline`
- `remotes.request`

Typical use cases:

- understand which remote provider a project uses
- inspect MR/PR and pipeline state
- read repository metadata without manually reconfiguring tokens elsewhere
- create MR/PR from AI workflows
- add comments to review threads
- rerun CI pipelines
- call provider APIs not yet wrapped by high-level tools

## Example JSON-RPC Requests

Initialize:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

List tools:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

List projects:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "projects.list",
    "arguments": {}
  }
}
```

Read terminal output:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "terminals.get_output",
    "arguments": {
      "terminalId": "terminal-123",
      "lines": 120
    }
  }
}
```

Tail terminal output after a cursor:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "terminals.tail",
    "arguments": {
      "terminalId": "terminal-123",
      "cursor": 120,
      "maxLines": 80
    }
  }
}
```

Write into an existing terminal:

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "terminals.write",
    "arguments": {
      "terminalId": "terminal-123",
      "text": "npm run test",
      "appendNewline": true
    }
  }
}
```

List pipelines for a project:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "remotes.list_pipelines",
    "arguments": {
      "projectPath": "/absolute/path/to/project",
      "limit": 10
    }
  }
}
```

Send a controlled provider API request:

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "tools/call",
  "params": {
    "name": "remotes.request",
    "arguments": {
      "projectPath": "/absolute/path/to/project",
      "method": "POST",
      "path": "projects/123/issues",
      "body": {
        "title": "example"
      }
    }
  }
}
```

## Example External Client Configuration

If an MCP client supports HTTP transport, point it at:

```text
http://127.0.0.1:3765/mcp
```

If the client also needs an initialization step, use standard JSON-RPC `initialize` first.

## Current Safety Boundaries

- OpenGit still does not expose raw GitLab / GitHub / Gitee tokens to AI clients
- high-risk capabilities are disabled by default in the Home settings drawer
- `remotes.request` is still host-locked to the detected provider API root
- terminal write only targets existing terminal sessions, it does not create new shells automatically

Still not included:

- local git write operations
- generic HTTP proxying
- public or LAN exposure

## Recommended Usage Pattern

For AI-assisted debugging:

1. Call `projects.get_active`
2. Call `terminals.get_project_outputs`
3. Call `terminals.get_recent_errors`
4. If the project has a remote provider, call:
   - `remotes.detect_provider`
   - `remotes.list_pipelines`
   - `remotes.get_pipeline`

This gives the AI:

- the active project path
- recent terminal logs
- likely error excerpts
- remote CI state

without requiring it to guess project context from the filesystem alone.
