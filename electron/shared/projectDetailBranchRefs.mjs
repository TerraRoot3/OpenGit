const normalizeBranchRef = (branch = '') => String(branch || '').trim()

export const parseRemoteBranchRef = (branch = '') => {
  const normalized = normalizeBranchRef(branch).replace(/^remotes\//, '')
  if (!normalized || normalized === 'HEAD' || normalized.endsWith('/HEAD')) {
    return null
  }

  const match = normalized.match(/^([^/]+)\/(.+)$/)
  if (!match) {
    return null
  }

  const [, remoteName, branchName] = match
  if (!remoteName || !branchName) {
    return null
  }

  return {
    remoteName,
    branchName,
    remoteRef: `${remoteName}/${branchName}`
  }
}

export const getRemoteBranchLocalName = (branch = '') => {
  return parseRemoteBranchRef(branch)?.branchName || normalizeBranchRef(branch)
}

export const resolveRemoteBranchTarget = (branch = '') => {
  const parsed = parseRemoteBranchRef(branch)
  if (parsed) {
    return {
      ...parsed,
      localBranchName: parsed.branchName
    }
  }

  const normalized = normalizeBranchRef(branch)
  if (!normalized) {
    return null
  }

  return {
    remoteName: 'origin',
    branchName: normalized,
    remoteRef: `origin/${normalized}`,
    localBranchName: normalized
  }
}

export const buildBranchListFromGitBranchAllOutput = (output = '') => {
  const localBranches = []
  const remoteBranches = []
  let currentBranch = ''

  for (const rawLine of String(output || '').split('\n')) {
    const trimmedStart = rawLine.replace(/^\s+/, '')
    if (!trimmedStart) {
      continue
    }

    const isCurrent = trimmedStart.startsWith('*')
    const branchName = trimmedStart.replace(/^\*\s*/, '').trim()

    if (!branchName || branchName.includes('->')) {
      continue
    }

    if (isCurrent) {
      currentBranch = branchName
    }

    if (branchName.startsWith('remotes/')) {
      const parsed = parseRemoteBranchRef(branchName)
      if (parsed) {
        remoteBranches.push(parsed.remoteRef)
      }
      continue
    }

    localBranches.push(branchName)
  }

  return {
    currentBranch,
    localBranches,
    remoteBranches
  }
}
