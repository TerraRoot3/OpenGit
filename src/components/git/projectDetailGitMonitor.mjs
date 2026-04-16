const FILE_SUMMARY_KEYS = [
  'changedCount',
  'stagedCount',
  'untrackedCount',
  'conflictedCount'
]

export const shouldRunProjectGitMonitor = ({
  path = '',
  isActive = false,
  isVisible = false
} = {}) => Boolean(path && isActive && isVisible)

export const deriveProjectGitMonitorRefreshRequest = (
  previousSnapshot,
  nextSnapshot
) => {
  if (!previousSnapshot || !nextSnapshot) return null
  if (previousSnapshot.signature === nextSnapshot.signature) return null

  if (previousSnapshot.currentBranch !== nextSnapshot.currentBranch) {
    return {
      reloadBranches: true,
      reloadBranchStatus: true,
      reloadFileStatus: true,
      reloadCommitHistory: true
    }
  }

  const request = {}

  if (
    previousSnapshot.localAhead !== nextSnapshot.localAhead ||
    previousSnapshot.remoteAhead !== nextSnapshot.remoteAhead
  ) {
    request.reloadBranchStatus = true
    request.reloadCommitHistory = true
  }

  if (FILE_SUMMARY_KEYS.some((key) => previousSnapshot[key] !== nextSnapshot[key])) {
    request.reloadFileStatus = true
  }

  if (
    previousSnapshot.isMerging !== nextSnapshot.isMerging ||
    previousSnapshot.isRebasing !== nextSnapshot.isRebasing
  ) {
    request.reloadBranchStatus = true
    request.reloadFileStatus = true
  }

  return Object.keys(request).length > 0 ? request : null
}
