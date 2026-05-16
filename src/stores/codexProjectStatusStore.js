import { computed, reactive } from 'vue'
import { registerDebugProvider } from '../debug/runtimeDebug.js'

const SUPPORTED_STATUSES = new Set(['running', 'awaiting_confirmation', 'ended'])

const state = reactive({
  statuses: {},
  apiAvailable: false,
  initialized: false,
  lastSnapshotAt: 0
})

let unsubscribeProjectStatus = null

function normalizeProjectPath(value) {
  const raw = typeof value === 'string' ? value.trim() : String(value || '').trim()
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function normalizeStatus(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return SUPPORTED_STATUSES.has(normalized) ? normalized : ''
}

function normalizeEntry(entry, fallbackPath = '') {
  if (typeof entry === 'string') {
    const path = normalizeProjectPath(fallbackPath)
    const status = normalizeStatus(entry)
    return path && status ? { path, status } : null
  }

  if (!entry || typeof entry !== 'object') return null

  const path = normalizeProjectPath(
    entry.path ||
    entry.projectPath ||
    entry.cwd ||
    fallbackPath
  )
  const rawStatus = typeof (entry.status || entry.state || entry.projectStatus) === 'string'
    ? String(entry.status || entry.state || entry.projectStatus).trim()
    : ''
  if (path && rawStatus === 'unknown') {
    return { path, status: '', remove: true }
  }
  const status = normalizeStatus(rawStatus)

  return path && status ? { path, status } : null
}

function normalizeEntries(payload) {
  if (!payload) return []

  const directEntry = normalizeEntry(payload)
  if (directEntry) {
    return [directEntry]
  }

  const source = Array.isArray(payload)
    ? payload
    : payload.projects || payload.statuses || payload.entries || payload.items || []

  if (Array.isArray(source)) {
    return source
      .map((entry) => normalizeEntry(entry))
      .filter(Boolean)
  }

  if (source && typeof source === 'object') {
    return Object.entries(source)
      .map(([path, entry]) => normalizeEntry(entry, path))
      .filter(Boolean)
  }

  return []
}

function replaceStatuses(entries) {
  const nextMap = Object.fromEntries(entries.filter((entry) => !entry.remove).map(({ path, status }) => [path, status]))
  for (const key of Object.keys(state.statuses)) {
    if (!(key in nextMap)) {
      delete state.statuses[key]
    }
  }
  for (const [path, status] of Object.entries(nextMap)) {
    state.statuses[path] = status
  }
  state.lastSnapshotAt = Date.now()
}

function patchStatuses(payload) {
  const entries = normalizeEntries(payload)
  if (entries.length === 0) return
  for (const { path, status, remove } of entries) {
    if (remove) {
      delete state.statuses[path]
      continue
    }
    state.statuses[path] = status
  }
  state.lastSnapshotAt = Date.now()
}

function getElectronApi() {
  if (typeof window === 'undefined') return null
  const api = window.electronAPI
  if (!api || typeof api !== 'object') return null
  return api
}

async function hydrateSnapshot(api) {
  if (typeof api?.getCodexProjectStatusSnapshot !== 'function') return
  try {
    const snapshot = await api.getCodexProjectStatusSnapshot()
    replaceStatuses(normalizeEntries(snapshot))
  } catch (error) {
    console.warn('获取 Codex 项目状态快照失败:', error)
  }
}

function subscribeStatusUpdates(api) {
  if (typeof api?.onCodexProjectStatusChanged !== 'function') return

  const handleUpdate = (payload) => {
    const shouldReplace = Boolean(payload?.replace || payload?.fullSnapshot || payload?.isSnapshot)
    if (shouldReplace) {
      replaceStatuses(normalizeEntries(payload))
      return
    }
    patchStatuses(payload)
  }

  try {
    const maybeUnsubscribe = api.onCodexProjectStatusChanged(handleUpdate)
    if (typeof maybeUnsubscribe === 'function') {
      unsubscribeProjectStatus = maybeUnsubscribe
      return
    }
    if (typeof api.removeCodexProjectStatusListener === 'function') {
      unsubscribeProjectStatus = () => api.removeCodexProjectStatusListener(handleUpdate)
    }
  } catch (error) {
    console.warn('订阅 Codex 项目状态更新失败:', error)
  }
}

async function ensureInitialized() {
  if (state.initialized || typeof window === 'undefined') return
  state.initialized = true

  const api = getElectronApi()
  state.apiAvailable = Boolean(
    api &&
    (
      typeof api.getCodexProjectStatusSnapshot === 'function' ||
      typeof api.onCodexProjectStatusChanged === 'function'
    )
  )

  if (!state.apiAvailable) return

  await hydrateSnapshot(api)
  subscribeStatusUpdates(api)
}

function getProjectStatus(projectPath) {
  const normalizedPath = normalizeProjectPath(projectPath)
  return normalizedPath ? state.statuses[normalizedPath] || '' : ''
}

registerDebugProvider('codexProjectStatus', () => ({
  apiAvailable: state.apiAvailable,
  trackedProjects: Object.keys(state.statuses).length,
  lastSnapshotAt: state.lastSnapshotAt || 0
}))

export function useCodexProjectStatusStore() {
  void ensureInitialized()

  const statuses = computed(() => state.statuses)

  return {
    statuses,
    apiAvailable: computed(() => state.apiAvailable),
    getProjectStatus
  }
}

export function cleanupCodexProjectStatusStore() {
  if (typeof unsubscribeProjectStatus === 'function') {
    unsubscribeProjectStatus()
    unsubscribeProjectStatus = null
  }
}
