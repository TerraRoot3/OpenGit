/**
 * 聚焦多终端页：会话 id 与当前聚焦 id（冷启动恢复，与 TerminalPanel snapshot-cache-key 对齐）
 * 仅通过 electron-store（setConfig/getConfig）持久化，不写 localStorage
 */
import { ref, watch, toRaw } from 'vue'

const ELECTRON_STORE_KEY = 'focus-terminal-layout-v1'
const MAX_SESSIONS = 9

const sessions = ref([])
const focusedId = ref('')
/** 首次从主进程拉取布局完成后再渲染子面板，避免 id 闪变 */
const layoutReady = ref(false)

let persistTimer = null
let hydratePromise = null

function mkId() {
  return `focus-term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function applyPayload(parsed = {}) {
  const raw = Array.isArray(parsed.sessions) ? parsed.sessions : []
  const next = raw
    .map((s) => (s && typeof s.id === 'string' && s.id.trim() ? { id: s.id.trim() } : null))
    .filter(Boolean)
    .slice(0, MAX_SESSIONS)

  if (!next.length) return false

  sessions.value = next
  const ids = next.map((s) => s.id)
  const f = typeof parsed.focusedId === 'string' ? parsed.focusedId.trim() : ''
  focusedId.value = f && ids.includes(f) ? f : ids[0]
  return true
}

function ensureDefaultLayout() {
  const id = mkId()
  sessions.value = [{ id }]
  focusedId.value = id
}

/** IPC structuredClone 不能传 Vue Proxy，需纯 JSON 结构 */
function buildPersistPayload() {
  const raw = toRaw(sessions.value)
  return {
    sessions: raw.map((s) => ({ id: String(s.id) })),
    focusedId: String(focusedId.value ?? '')
  }
}

const persistNow = () => {
  if (!layoutReady.value) return
  const payload = buildPersistPayload()
  if (typeof window !== 'undefined' && window.electronAPI?.setConfig) {
    window.electronAPI.setConfig(ELECTRON_STORE_KEY, payload).catch((error) => {
      console.warn('保存聚焦终端布局到 electron-store 失败:', error)
    })
  }
}

const schedulePersist = () => {
  if (!layoutReady.value) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistNow()
  }, 100)
}

watch([sessions, focusedId], schedulePersist, { deep: true })

export function useFocusTerminalStore() {
  const hydrate = async () => {
    if (layoutReady.value) return
    if (hydratePromise) return hydratePromise

    hydratePromise = (async () => {
      try {
        if (typeof window !== 'undefined' && window.electronAPI?.getConfig) {
          const payload = await window.electronAPI.getConfig(ELECTRON_STORE_KEY)
          if (payload && typeof payload === 'object' && applyPayload(payload)) {
            layoutReady.value = true
            return
          }
        }
      } catch (error) {
        console.warn('从 electron-store 恢复聚焦终端布局失败:', error)
      }
      ensureDefaultLayout()
      layoutReady.value = true
    })()

    try {
      await hydratePromise
    } finally {
      hydratePromise = null
    }
  }

  const addSession = () => {
    if (sessions.value.length >= MAX_SESSIONS) return
    const id = mkId()
    sessions.value = [...sessions.value, { id }]
    focusedId.value = id
  }

  const removeSession = (id) => {
    if (sessions.value.length <= 1) return
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx === -1) return
    const next = sessions.value.filter((s) => s.id !== id)
    sessions.value = next
    if (focusedId.value === id) {
      const pick = next[Math.max(0, idx - 1)] || next[0]
      focusedId.value = pick.id
    }
  }

  const focusSession = (id) => {
    if (sessions.value.some((s) => s.id === id)) {
      focusedId.value = id
    }
  }

  return {
    sessions,
    focusedId,
    layoutReady,
    MAX_SESSIONS,
    hydrate,
    addSession,
    removeSession,
    focusSession
  }
}
