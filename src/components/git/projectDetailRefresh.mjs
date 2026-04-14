export const buildProjectRefreshPlan = (
  request = {},
  visibility = {},
  overrides = {}
) => {
  const reloadBranches = Boolean(request.reloadBranches)
  const reloadBranchStatus = Boolean(request.reloadBranchStatus)
  const reloadFileStatus = Boolean(request.reloadFileStatus)
  const preserveFileStatus = Boolean(request.preserveFileStatus)
  const reloadTags = Boolean(
    overrides.reloadTags ?? request.reloadTags ?? visibility.showTags
  )
  const defaultReloadCommitHistory =
    reloadBranches || reloadBranchStatus || reloadTags
  const reloadCommitHistory = Boolean(
    overrides.reloadCommitHistory ??
    request.reloadCommitHistory ??
    defaultReloadCommitHistory
  )

  return {
    reloadBranches,
    reloadBranchStatus,
    reloadFileStatus,
    preserveFileStatus,
    reloadTags,
    reloadCommitHistory
  }
}

export const deriveBranchStatusState = ({
  existingCurrentBranch = '',
  statusPayload = {}
} = {}) => ({
  currentBranch: statusPayload.currentBranch || existingCurrentBranch,
  branchStatus: statusPayload.currentBranchStatus || null,
  allBranchStatus: statusPayload.allBranchStatus || {}
})
