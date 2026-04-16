export const resolveTagsViewState = ({
  tagsLoading = false,
  tags = []
} = {}) => {
  if (tagsLoading && Array.isArray(tags) && tags.length === 0) {
    return 'loading'
  }

  if (!Array.isArray(tags) || tags.length === 0) {
    return 'empty'
  }

  return 'list'
}
