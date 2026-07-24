const workspaceEditorSessions = new Map()

export const WORKSPACE_EDITOR_RELEASE_DELAY_MS = 8000

export function normalizeWorkspaceProjectPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

function createWorkspaceEditorSession(projectPath) {
  return {
    projectPath,
    pathToModel: new Map(),
    pathToViewState: new Map()
  }
}

export function getWorkspaceEditorSession(projectPath) {
  const key = normalizeWorkspaceProjectPath(projectPath)
  if (!workspaceEditorSessions.has(key)) {
    workspaceEditorSessions.set(key, createWorkspaceEditorSession(key))
  }
  return workspaceEditorSessions.get(key)
}

export function clearWorkspaceEditorSession(projectPath) {
  const key = normalizeWorkspaceProjectPath(projectPath)
  const session = workspaceEditorSessions.get(key)
  if (!session) return
  session.pathToViewState.clear()
  for (const model of session.pathToModel.values()) {
    model.dispose()
  }
  session.pathToModel.clear()
  workspaceEditorSessions.delete(key)
}
