const DEFAULT_PAGE_SIZE = 500

export const COMMIT_HISTORY_SCOPE = Object.freeze({
  ALL: 'all',
  CURRENT: 'current',
  BRANCH: 'branch'
})

export const normalizeLocalBranches = (branches = []) => (
  Array.from(new Set(
    branches
      .filter(Boolean)
      .map((branch) => branch.trim())
      .filter(Boolean)
  )).sort((left, right) => left.localeCompare(right))
)

export const createBranchScopeOptions = ({
  currentBranch = '',
  allBranches = []
} = {}) => {
  const localBranches = normalizeLocalBranches(allBranches)
  const options = [
    { value: COMMIT_HISTORY_SCOPE.ALL, label: '全部历史' }
  ]

  if (currentBranch && !currentBranch.includes('HEAD detached')) {
    options.push({
      value: COMMIT_HISTORY_SCOPE.CURRENT,
      label: `当前分支 (${currentBranch})`
    })
  }

  for (const branch of localBranches) {
    options.push({
      value: `branch:${branch}`,
      label: branch,
      branch
    })
  }

  return options
}

export const deriveScopeState = ({
  currentBranch = '',
  selectedScope = COMMIT_HISTORY_SCOPE.ALL,
  selectedBranch = ''
} = {}) => {
  if (selectedScope === COMMIT_HISTORY_SCOPE.CURRENT) {
    const branch = currentBranch && !currentBranch.includes('HEAD detached')
      ? currentBranch
      : ''
    return {
      scope: branch ? COMMIT_HISTORY_SCOPE.CURRENT : COMMIT_HISTORY_SCOPE.ALL,
      branch
    }
  }

  if (selectedScope === COMMIT_HISTORY_SCOPE.BRANCH) {
    return {
      scope: selectedBranch ? COMMIT_HISTORY_SCOPE.BRANCH : COMMIT_HISTORY_SCOPE.ALL,
      branch: selectedBranch || ''
    }
  }

  return {
    scope: COMMIT_HISTORY_SCOPE.ALL,
    branch: ''
  }
}

const escapeDoubleQuotes = (value = '') => value.replace(/"/g, '\\"')

export const buildCommitHistoryCommand = ({
  projectPath,
  currentBranch = '',
  selectedScope = COMMIT_HISTORY_SCOPE.ALL,
  selectedBranch = '',
  skip = 0,
  maxCount = DEFAULT_PAGE_SIZE
} = {}) => {
  const scopeState = deriveScopeState({
    currentBranch,
    selectedScope,
    selectedBranch
  })
  const revisionArg = scopeState.scope === COMMIT_HISTORY_SCOPE.ALL
    ? '--all'
    : `"${escapeDoubleQuotes(scopeState.branch)}"`

  const paginationArgs = [`--max-count=${maxCount}`]
  if (skip > 0) {
    paginationArgs.push(`--skip=${skip}`)
  }

  return `cd "${escapeDoubleQuotes(projectPath || '')}" && git log ${revisionArg} --decorate --pretty=format:"%H|%h|%an|%ae|%ad|%s|%P|%d" --date=format:"%Y-%m-%d %H:%M" ${paginationArgs.join(' ')}`
}

export const buildBranchHeadMap = (rawRefs = '') => {
  const branchHeads = {}
  for (const line of rawRefs.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [branch, hash] = trimmed.split('|')
    if (branch && hash) {
      branchHeads[hash.trim()] = branch.trim()
    }
  }
  return branchHeads
}

export const mergeCommitPages = (existingCommits = [], nextCommits = [], append = false) => {
  if (!append) {
    return [...nextCommits]
  }

  const seen = new Set(existingCommits.map((commit) => commit.hash))
  const merged = [...existingCommits]

  for (const commit of nextCommits) {
    if (!seen.has(commit.hash)) {
      merged.push(commit)
      seen.add(commit.hash)
    }
  }

  return merged
}

export const captureScrollAnchor = (container) => {
  if (!container) {
    return null
  }

  return {
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight
  }
}

export const restoreScrollAnchor = (container, anchor, strategy = 'preserve-offset') => {
  if (!container || !anchor) {
    return
  }

  if (strategy === 'top') {
    container.scrollTop = 0
    return
  }

  const delta = container.scrollHeight - anchor.scrollHeight
  container.scrollTop = Math.max(0, anchor.scrollTop + delta)
}

const distanceBetweenPoints = (left, right) => Math.hypot(
  right.x - left.x,
  right.y - left.y
)

const moveTowardPoint = (from, to, distance) => {
  const length = distanceBetweenPoints(from, to)
  if (!length || distance <= 0) {
    return { ...from }
  }

  const ratio = Math.min(1, distance / length)
  return {
    x: from.x + ((to.x - from.x) * ratio),
    y: from.y + ((to.y - from.y) * ratio)
  }
}

export const buildRoundedPath = (points = [], radius = 10) => {
  if (!points.length) {
    return ''
  }

  if (points.length === 1) {
    return `M${points[0].x},${points[0].y}`
  }

  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
  }

  let path = `M${points[0].x},${points[0].y}`

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const prevLength = distanceBetweenPoints(previous, current)
    const nextLength = distanceBetweenPoints(current, next)
    const usableRadius = Math.min(radius, prevLength / 2, nextLength / 2)

    if (!usableRadius) {
      path += ` L${current.x},${current.y}`
      continue
    }

    const curveStart = moveTowardPoint(current, previous, usableRadius)
    const curveEnd = moveTowardPoint(current, next, usableRadius)
    path += ` L${curveStart.x},${curveStart.y}`
    path += ` Q${current.x},${current.y} ${curveEnd.x},${curveEnd.y}`
  }

  const lastPoint = points[points.length - 1]
  path += ` L${lastPoint.x},${lastPoint.y}`
  return path
}

export const buildOrthogonalRoundedPath = (points = [], radius = 6) => {
  if (!points.length) {
    return ''
  }

  if (points.length === 1) {
    return `M${points[0].x},${points[0].y}`
  }

  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
  }

  const commands = [`M${points[0].x},${points[0].y}`]

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const prevLength = distanceBetweenPoints(previous, current)
    const nextLength = distanceBetweenPoints(current, next)
    const cornerRadius = Math.min(radius, prevLength / 2, nextLength / 2)

    if (!cornerRadius) {
      commands.push(`L${current.x},${current.y}`)
      continue
    }

    const start = moveTowardPoint(current, previous, cornerRadius)
    const end = moveTowardPoint(current, next, cornerRadius)
    commands.push(`L${start.x},${start.y}`)
    commands.push(`Q${current.x},${current.y} ${end.x},${end.y}`)
  }

  const lastPoint = points[points.length - 1]
  commands.push(`L${lastPoint.x},${lastPoint.y}`)
  return commands.join(' ')
}
