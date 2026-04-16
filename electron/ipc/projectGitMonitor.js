function countStatusFlags(xy = '') {
  const [indexStatus = '.', worktreeStatus = '.'] = `${xy}`
  return {
    stagedCount: indexStatus !== '.' ? 1 : 0,
    changedCount: worktreeStatus !== '.' ? 1 : 0
  }
}

function parseProjectGitMonitorPorcelain(stdout = '') {
  const result = {
    currentBranch: '',
    upstream: '',
    localAhead: 0,
    remoteAhead: 0,
    changedCount: 0,
    stagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0
  }

  const lines = stdout.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line) continue

    if (line.startsWith('# branch.head ')) {
      result.currentBranch = line.replace('# branch.head ', '').trim()
      continue
    }

    if (line.startsWith('# branch.upstream ')) {
      result.upstream = line.replace('# branch.upstream ', '').trim()
      continue
    }

    if (line.startsWith('# branch.ab ')) {
      const match = line.match(/# branch\.ab \+(\d+) -(\d+)/)
      if (match) {
        result.localAhead = parseInt(match[1], 10) || 0
        result.remoteAhead = parseInt(match[2], 10) || 0
      }
      continue
    }

    if (line.startsWith('? ')) {
      result.untrackedCount += 1
      continue
    }

    if (line.startsWith('u ')) {
      result.conflictedCount += 1
      continue
    }

    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const xy = line.split(/\s+/, 3)[1] || '..'
      const counts = countStatusFlags(xy)
      result.changedCount += counts.changedCount
      result.stagedCount += counts.stagedCount
    }
  }

  return result
}

function buildProjectGitMonitorSnapshot({
  porcelain = '',
  isMerging = false,
  isRebasing = false
} = {}) {
  const parsed = typeof porcelain === 'string'
    ? parseProjectGitMonitorPorcelain(porcelain)
    : { ...porcelain }

  const snapshot = {
    currentBranch: parsed.currentBranch || '',
    upstream: parsed.upstream || '',
    localAhead: parsed.localAhead || 0,
    remoteAhead: parsed.remoteAhead || 0,
    changedCount: parsed.changedCount || 0,
    stagedCount: parsed.stagedCount || 0,
    untrackedCount: parsed.untrackedCount || 0,
    conflictedCount: parsed.conflictedCount || 0,
    isMerging: Boolean(isMerging),
    isRebasing: Boolean(isRebasing)
  }

  snapshot.signature = [
    snapshot.currentBranch,
    snapshot.localAhead,
    snapshot.remoteAhead,
    snapshot.changedCount,
    snapshot.stagedCount,
    snapshot.untrackedCount,
    snapshot.conflictedCount,
    snapshot.isMerging ? 1 : 0,
    snapshot.isRebasing ? 1 : 0
  ].join('|')

  return snapshot
}

module.exports = {
  parseProjectGitMonitorPorcelain,
  buildProjectGitMonitorSnapshot
}
