/**
 * 聚焦多终端页：会话 id 与当前聚焦 id
 * 按需求禁用持久化，重启后始终从一个新会话开始。
 */
import { ref } from 'vue'

const MAX_SESSIONS = 9

const sessions = ref([])
const focusedId = ref('')
/** 首次从主进程拉取布局完成后再渲染子面板，避免 id 闪变 */
const layoutReady = ref(false)

function mkId() {
  return `focus-term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function ensureDefaultLayout() {
  const id = mkId()
  sessions.value = [{ id }]
  focusedId.value = id
}

function resetLayout() {
  sessions.value = []
  focusedId.value = ''
  layoutReady.value = false
}

export function useFocusTerminalStore() {
  const hydrate = async () => {
    if (layoutReady.value) return
    ensureDefaultLayout()
    layoutReady.value = true
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
    resetLayout,
    addSession,
    removeSession,
    focusSession
  }
}
