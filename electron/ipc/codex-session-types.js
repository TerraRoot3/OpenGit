const CODEX_SESSION_STATUS = Object.freeze({
  RUNNING: 'running',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  ENDED: 'ended',
  UNKNOWN: 'unknown'
})

const PROJECT_STATUS_PRIORITY = Object.freeze({
  [CODEX_SESSION_STATUS.AWAITING_CONFIRMATION]: 4,
  [CODEX_SESSION_STATUS.RUNNING]: 3,
  [CODEX_SESSION_STATUS.ENDED]: 2,
  [CODEX_SESSION_STATUS.UNKNOWN]: 1
})

function isKnownCodexSessionStatus(value) {
  return Object.values(CODEX_SESSION_STATUS).includes(value)
}

module.exports = {
  CODEX_SESSION_STATUS,
  PROJECT_STATUS_PRIORITY,
  isKnownCodexSessionStatus
}
