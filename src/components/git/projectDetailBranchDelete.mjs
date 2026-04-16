export const buildBranchDeleteDialogPlan = ({
  branch = '',
  contextType = 'local',
  currentBranch = ''
} = {}) => {
  if (!branch) return null

  if (contextType === 'local' && branch === currentBranch) {
    return null
  }

  const remoteOnly = contextType === 'remote'

  return {
    branch,
    deleteLocal: !remoteOnly,
    deleteRemote: remoteOnly,
    showRemoteToggle: !remoteOnly,
    message: remoteOnly
      ? `确定要删除远程分支 ${branch} 吗？`
      : `确定要删除分支 ${branch} 吗？`,
    operationText: remoteOnly
      ? `正在删除远程分支 "${branch}"...\n`
      : `正在删除分支 "${branch}"...\n`
  }
}

export const buildBranchDeleteCommands = ({
  projectPath = '',
  branch = '',
  deleteLocal = false,
  deleteRemote = false
} = {}) => {
  if (!projectPath || !branch) return []

  const commands = []

  if (deleteLocal) {
    commands.push(`cd "${projectPath}" && git branch -D "${branch}"`)
  }

  if (deleteRemote) {
    commands.push(`cd "${projectPath}" && git push origin --delete "${branch}"`)
  }

  return commands
}
