export const escapeShellPath = (filePath = '') => {
  const value = String(filePath || '').trim()
  if (!value) return ''
  return value.replace(/([\\\s"'`$!(){}[\]*?&;|<>])/g, '\\$1')
}

export const buildDropPayload = (paths = []) => {
  if (!Array.isArray(paths)) return ''
  return paths
    .map(escapeShellPath)
    .filter(Boolean)
    .join(' ')
}
