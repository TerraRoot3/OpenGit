/**
 * 聚焦多终端页：会话 id 与当前聚焦 id
 * 按需求禁用持久化，重启后始终从一个新会话开始。
 */
import { computed, unref, ref } from 'vue'

const MAX_SESSIONS = 9
const scopeStates = new Map()

function mkId() {
  return `focus-term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeScopeKey(scopeSource) {
  const raw = typeof scopeSource === 'string' ? scopeSource : String(scopeSource || '')
  const normalized = raw.trim()
  return normalized || '__default__'
}

function createScopeState() {
  const sessions = ref([])
  const focusedId = ref('')
  /** 首次从主进程拉取布局完成后再渲染子面板，避免 id 闪变 */
  const layoutReady = ref(false)

  return {
    sessions,
    focusedId,
    layoutReady
  }
}

function getScopeState(scopeSource) {
  const key = normalizeScopeKey(scopeSource)
  if (!scopeStates.has(key)) {
    scopeStates.set(key, createScopeState())
  }
  return scopeStates.get(key)
}

export function useFocusTerminalStore(scopeSource = '__default__') {
  const scopeKey = computed(() => normalizeScopeKey(unref(scopeSource)))
  const scopeState = computed(() => getScopeState(scopeKey.value))

  const ensureDefaultLayout = () => {
    const id = mkId()
    scopeState.value.sessions.value = [{ id }]
    scopeState.value.focusedId.value = id
  }

  const resetLayout = ({ clearCache = false } = {}) => {
    scopeState.value.sessions.value = []
    scopeState.value.focusedId.value = ''
    scopeState.value.layoutReady.value = false
    if (clearCache) {
      scopeStates.delete(scopeKey.value)
    }
  }

  const hydrate = async () => {
    if (scopeState.value.layoutReady.value) return
    ensureDefaultLayout()
    scopeState.value.layoutReady.value = true
  }

  const addSession = () => {
    if (scopeState.value.sessions.value.length >= MAX_SESSIONS) return
    const id = mkId()
    scopeState.value.sessions.value = [...scopeState.value.sessions.value, { id }]
    scopeState.value.focusedId.value = id
  }

  const removeSession = (id) => {
    if (scopeState.value.sessions.value.length <= 1) return
    const idx = scopeState.value.sessions.value.findIndex((s) => s.id === id)
    if (idx === -1) return
    const next = scopeState.value.sessions.value.filter((s) => s.id !== id)
    scopeState.value.sessions.value = next
    if (scopeState.value.focusedId.value === id) {
      const pick = next[Math.max(0, idx - 1)] || next[0]
      scopeState.value.focusedId.value = pick.id
    }
  }

  const focusSession = (id) => {
    if (scopeState.value.sessions.value.some((s) => s.id === id)) {
      scopeState.value.focusedId.value = id
    }
  }

  const swapSessionOrder = (leftId, rightId) => {
    if (!leftId || !rightId || leftId === rightId) return false
    const list = [...scopeState.value.sessions.value]
    const leftIndex = list.findIndex((item) => item.id === leftId)
    const rightIndex = list.findIndex((item) => item.id === rightId)
    if (leftIndex === -1 || rightIndex === -1) return false
    ;[list[leftIndex], list[rightIndex]] = [list[rightIndex], list[leftIndex]]
    scopeState.value.sessions.value = list
    return true
  }

  return {
    sessions: computed(() => scopeState.value.sessions.value),
    focusedId: computed(() => scopeState.value.focusedId.value),
    layoutReady: computed(() => scopeState.value.layoutReady.value),
    MAX_SESSIONS,
    hydrate,
    resetLayout,
    addSession,
    removeSession,
    focusSession,
    swapSessionOrder
  }
}
