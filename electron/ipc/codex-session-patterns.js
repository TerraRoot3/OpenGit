const { CODEX_SESSION_STATUS } = require('./codex-session-types')

const CODEX_COMMAND_PATTERN = /(^|[;&|]\s*)(?:env\s+[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|[^\s]+)\s+)*(?:\S+\/)?codex(?:\s|$)/i
const CODEX_PROCESS_PATTERN = /(^|[\/\s_-])codex(?:$|[\s._-])/i
const INTERACTIVE_SHELL_PROCESS_PATTERN = /(^|[\/\s_-])(zsh|bash|fish|nu|pwsh|powershell)(?:$|[\s._-])/i
const AWAITING_CONFIRMATION_HEADLINE_PATTERNS = [
  /\bawaiting confirmation\b/i,
  /\bapproval required\b/i,
  /\bdo you want to allow (?:this|the) action\b/i,
  /\bpress enter to confirm\b/i,
  /\bwould you like to run the following command\??/i,
  /\bwould you like to (?:run|execute|apply) (?:the following )?(?:command|patch|change)s?\??/i,
  /\bconfirm(?:ation)? required\b/i,
  /\bselect an option\b/i,
  /\bchoose an option\b/i
]
const AWAITING_CONFIRMATION_OPTION_PATTERNS = [
  /\byes,\s*proceed\s*\(y\)/i,
  /\bdon't ask again\b/i,
  /\btell codex what to do differently\b/i,
  /\bno,\s*and tell codex\b/i,
  /\bproceed\s*\(y\)/i,
  /\bcancel\s*\(n\)/i,
  /\bcontinue\?\s*\[[^\]]+\]/i,
  /(?:^|\n)\s*\d+\.\s+(?:yes|no)\b/i
]

const OUTPUT_MATCHERS = [
  {
    status: CODEX_SESSION_STATUS.AWAITING_CONFIRMATION,
    reason: 'output.awaiting_confirmation',
    pattern: /\bawaiting confirmation\b/i
  },
  {
    status: CODEX_SESSION_STATUS.AWAITING_CONFIRMATION,
    reason: 'output.approval_required',
    pattern: /\bapproval required\b/i
  },
  {
    status: CODEX_SESSION_STATUS.AWAITING_CONFIRMATION,
    reason: 'output.allow_action_prompt',
    pattern: /\bdo you want to allow (?:this|the) action\b/i
  },
  {
    status: CODEX_SESSION_STATUS.AWAITING_CONFIRMATION,
    reason: 'output.confirm_prompt',
    pattern: /\bpress enter to confirm\b/i
  },
  {
    status: CODEX_SESSION_STATUS.AWAITING_CONFIRMATION,
    reason: 'output.command_execution_prompt',
    pattern: /\bwould you like to run the following command\??/i
  },
  {
    status: CODEX_SESSION_STATUS.AWAITING_CONFIRMATION,
    reason: 'output.command_execution_choices',
    pattern: /\byes,\s*proceed\s*\(y\)|don't ask again|tell codex what to do differently/i
  },
  {
    status: CODEX_SESSION_STATUS.ENDED,
    reason: 'output.session_ended',
    pattern: /\bsession ended\b/i
  },
  {
    status: CODEX_SESSION_STATUS.ENDED,
    reason: 'output.codex_finished',
    pattern: /\bcodex (?:session )?(?:finished|exited)\b/i
  },
  {
    status: CODEX_SESSION_STATUS.RUNNING,
    reason: 'output.codex_banner',
    pattern: /\bopenai codex\b/i
  }
]

function normalizeMultilineText(value) {
  return String(value || '').replace(/\u0000/g, '')
}

function detectCodexCommand(text) {
  const normalized = normalizeMultilineText(text).trim()
  if (!normalized) return false
  return CODEX_COMMAND_PATTERN.test(normalized)
}

function detectCodexProcess(processName) {
  const normalized = String(processName || '').trim()
  if (!normalized) return false
  return CODEX_PROCESS_PATTERN.test(normalized)
}

function detectInteractiveShellProcess(processName) {
  const normalized = String(processName || '').trim()
  if (!normalized) return false
  return INTERACTIVE_SHELL_PROCESS_PATTERN.test(normalized)
}

function detectCodexOutputStatus(text) {
  const normalized = normalizeMultilineText(text)
  if (!normalized) return null
  const hasAwaitingHeadline = AWAITING_CONFIRMATION_HEADLINE_PATTERNS.some((pattern) => pattern.test(normalized))
  const hasAwaitingOptions = AWAITING_CONFIRMATION_OPTION_PATTERNS.some((pattern) => pattern.test(normalized))
  if (hasAwaitingHeadline && hasAwaitingOptions) {
    return {
      status: CODEX_SESSION_STATUS.AWAITING_CONFIRMATION,
      reason: 'output.awaiting_confirmation_composite'
    }
  }
  for (const matcher of OUTPUT_MATCHERS) {
    if (matcher.pattern.test(normalized)) {
      return {
        status: matcher.status,
        reason: matcher.reason
      }
    }
  }
  return null
}

module.exports = {
  detectCodexCommand,
  detectCodexOutputStatus,
  detectCodexProcess,
  detectInteractiveShellProcess
}
